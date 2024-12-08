package controllers

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/constants"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	"github.com/go-logr/logr"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	infisicalSdk "github.com/infisical/go-sdk"
	k8Errors "k8s.io/apimachinery/pkg/api/errors"
)

func (r *InfisicalPushSecretReconciler) handleAuthentication(ctx context.Context, infisicalSecret v1alpha1.InfisicalPushSecret, infisicalClient infisicalSdk.InfisicalClientInterface) (util.AuthenticationDetails, error) {
	authStrategies := map[util.AuthStrategyType]func(ctx context.Context, reconcilerClient client.Client, secretCrd util.SecretAuthInput, infisicalClient infisicalSdk.InfisicalClientInterface) (util.AuthenticationDetails, error){
		util.AuthStrategy.UNIVERSAL_MACHINE_IDENTITY:    util.HandleUniversalAuth,
		util.AuthStrategy.KUBERNETES_MACHINE_IDENTITY:   util.HandleKubernetesAuth,
		util.AuthStrategy.AWS_IAM_MACHINE_IDENTITY:      util.HandleAwsIamAuth,
		util.AuthStrategy.AZURE_MACHINE_IDENTITY:        util.HandleAzureAuth,
		util.AuthStrategy.GCP_ID_TOKEN_MACHINE_IDENTITY: util.HandleGcpIdTokenAuth,
		util.AuthStrategy.GCP_IAM_MACHINE_IDENTITY:      util.HandleGcpIamAuth,
	}

	for authStrategy, authHandler := range authStrategies {
		authDetails, err := authHandler(ctx, r.Client, util.SecretAuthInput{
			Secret: infisicalSecret,
			Type:   util.SecretCrd.INFISICAL_PUSH_SECRET,
		}, infisicalClient)

		if err == nil {
			return authDetails, nil
		}

		if !errors.Is(err, util.ErrAuthNotApplicable) {
			return util.AuthenticationDetails{}, fmt.Errorf("authentication failed for strategy [%s] [err=%w]", authStrategy, err)
		}
	}

	return util.AuthenticationDetails{}, fmt.Errorf("no authentication method provided")

}

func (r *InfisicalPushSecretReconciler) getInfisicalCaCertificateFromKubeSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalPushSecret) (caCertificate string, err error) {

	caCertificateFromKubeSecret, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
		Namespace: infisicalSecret.Spec.TLS.CaRef.SecretNamespace,
		Name:      infisicalSecret.Spec.TLS.CaRef.SecretName,
	})

	if k8Errors.IsNotFound(err) {
		return "", fmt.Errorf("kubernetes secret containing custom CA certificate cannot be found. [err=%s]", err)
	}

	if err != nil {
		return "", fmt.Errorf("something went wrong when fetching your CA certificate [err=%s]", err)
	}

	caCertificateFromSecret := string(caCertificateFromKubeSecret.Data[infisicalSecret.Spec.TLS.CaRef.SecretKey])

	return caCertificateFromSecret, nil
}

func (r *InfisicalPushSecretReconciler) getResourceVariables(infisicalPushSecret v1alpha1.InfisicalPushSecret) util.ResourceVariables {

	var resourceVariables util.ResourceVariables

	if _, ok := infisicalPushSecretResourceVariablesMap[string(infisicalPushSecret.UID)]; !ok {

		ctx, cancel := context.WithCancel(context.Background())

		client := infisicalSdk.NewInfisicalClient(ctx, infisicalSdk.Config{
			SiteUrl:       api.API_HOST_URL,
			CaCertificate: api.API_CA_CERTIFICATE,
			UserAgent:     api.USER_AGENT_NAME,
		})

		infisicalPushSecretResourceVariablesMap[string(infisicalPushSecret.UID)] = util.ResourceVariables{
			InfisicalClient: client,
			CancelCtx:       cancel,
			AuthDetails:     util.AuthenticationDetails{},
		}

		resourceVariables = infisicalPushSecretResourceVariablesMap[string(infisicalPushSecret.UID)]

	} else {
		resourceVariables = infisicalPushSecretResourceVariablesMap[string(infisicalPushSecret.UID)]
	}

	return resourceVariables

}

func (r *InfisicalPushSecretReconciler) updateResourceVariables(infisicalPushSecret v1alpha1.InfisicalPushSecret, resourceVariables util.ResourceVariables) {
	infisicalPushSecretResourceVariablesMap[string(infisicalPushSecret.UID)] = resourceVariables
}

func (r *InfisicalPushSecretReconciler) ReconcileInfisicalPushSecret(ctx context.Context, logger logr.Logger, infisicalPushSecret v1alpha1.InfisicalPushSecret) error {

	resourceVariables := r.getResourceVariables(infisicalPushSecret)
	infisicalClient := resourceVariables.InfisicalClient
	cancelCtx := resourceVariables.CancelCtx
	authDetails := resourceVariables.AuthDetails
	var err error

	if authDetails.AuthStrategy == "" {
		logger.Info("No authentication strategy found. Attempting to authenticate")
		authDetails, err = r.handleAuthentication(ctx, infisicalPushSecret, infisicalClient)
		r.SetAuthenticatedConditions(ctx, &infisicalPushSecret, err)

		if err != nil {
			return fmt.Errorf("unable to authenticate [err=%s]", err)
		}

		r.updateResourceVariables(infisicalPushSecret, util.ResourceVariables{
			InfisicalClient: infisicalClient,
			CancelCtx:       cancelCtx,
			AuthDetails:     authDetails,
		})
	}

	kubePushSecret, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
		Namespace: infisicalPushSecret.Spec.Push.Secret.SecretNamespace,
		Name:      infisicalPushSecret.Spec.Push.Secret.SecretName,
	})

	if err != nil {
		return fmt.Errorf("unable to fetch kube secret [err=%s]", err)
	}

	var kubeSecrets = make(map[string]string)

	for key, value := range kubePushSecret.Data {
		kubeSecrets[key] = string(value)
	}

	destination := infisicalPushSecret.Spec.Destination
	existingSecrets, err := infisicalClient.Secrets().List(infisicalSdk.ListSecretsOptions{
		ProjectID:      destination.ProjectID,
		Environment:    destination.EnvironmentSlug,
		SecretPath:     destination.SecretsPath,
		IncludeImports: false,
	})

	existingSecretsContainsKey := func(key string) bool {
		for _, secret := range existingSecrets {
			if secret.SecretKey == key {
				return true
			}
		}
		return false
	}

	getExistingSecretByKey := func(key string) *infisicalSdk.Secret {
		for _, secret := range existingSecrets {
			if secret.SecretKey == key {
				return &secret
			}
		}
		return nil
	}

	getExistingSecretById := func(id string) *infisicalSdk.Secret {
		for _, secret := range existingSecrets {
			if secret.ID == id {
				return &secret
			}
		}
		return nil
	}

	if err != nil {
		return fmt.Errorf("unable to list secrets [err=%s]", err)
	}

	updatePolicy := infisicalPushSecret.Spec.UpdatePolicy

	var secretsFailedToCreate []string
	var secretsFailedToUpdate []string
	var secretsFailedToDelete []string
	var secretsFailedToReplaceById []string

	// If the ManagedSecrets are nil, we know this is the first time the InfisicalPushSecret is being reconciled.
	if infisicalPushSecret.Status.ManagedSecrets == nil {

		infisicalPushSecret.Status.ManagedSecrets = make(map[string]string) // (string[id], string[key] )

		for secretKey, secretValue := range kubeSecrets {
			if existingSecretsContainsKey(secretKey) {
				if updatePolicy == string(constants.PUSH_SECRET_REPLACE_POLICY_ENABLED) {
					updatedSecret, err := infisicalClient.Secrets().Update(infisicalSdk.UpdateSecretOptions{
						SecretKey:      secretKey,
						ProjectID:      destination.ProjectID,
						Environment:    destination.EnvironmentSlug,
						SecretPath:     destination.SecretsPath,
						NewSecretValue: secretValue,
					})

					if err != nil {
						secretsFailedToUpdate = append(secretsFailedToUpdate, secretKey)
						logger.Info(fmt.Sprintf("unable to update secret [key=%s] [err=%s]", secretKey, err))
						continue
					}

					infisicalPushSecret.Status.ManagedSecrets[updatedSecret.ID] = secretKey
				}
			} else {
				createdSecret, err := infisicalClient.Secrets().Create(infisicalSdk.CreateSecretOptions{
					SecretKey:   secretKey,
					SecretValue: secretValue,
					ProjectID:   destination.ProjectID,
					Environment: destination.EnvironmentSlug,
					SecretPath:  destination.SecretsPath,
				})

				if err != nil {
					secretsFailedToCreate = append(secretsFailedToCreate, secretKey)
					logger.Info(fmt.Sprintf("unable to create secret [key=%s] [err=%s]", secretKey, err))
					continue
				}

				infisicalPushSecret.Status.ManagedSecrets[createdSecret.ID] = secretKey
			}
		}
	} else {

		// Loop over all the managed secrets, and find the corresponding existingSecret that has the same ID. If the key doesn't match, delete the secret, and re-create it with the correct key/value
		for managedSecretId, managedSecretKey := range infisicalPushSecret.Status.ManagedSecrets {

			existingSecret := getExistingSecretById(managedSecretId)

			if existingSecret != nil {

				if existingSecret.SecretKey != managedSecretKey {
					// Secret key has changed, lets delete the secret and re-create it with the correct key

					logger.Info(fmt.Sprintf("Secret with ID [id=%s] has changed key from [%s] to [%s]. Deleting and re-creating secret", managedSecretId, managedSecretKey, existingSecret.SecretKey))

					deletedSecret, err := infisicalClient.Secrets().Delete(infisicalSdk.DeleteSecretOptions{
						SecretKey:   existingSecret.SecretKey,
						ProjectID:   destination.ProjectID,
						Environment: destination.EnvironmentSlug,
						SecretPath:  destination.SecretsPath,
					})

					if err != nil {
						secretsFailedToReplaceById = append(secretsFailedToReplaceById, managedSecretKey)
						logger.Info(fmt.Sprintf("unable to delete secret [key=%s] [err=%s]", managedSecretKey, err))
						continue
					}

					createdSecret, err := infisicalClient.Secrets().Create(infisicalSdk.CreateSecretOptions{
						SecretKey:   managedSecretKey,
						SecretValue: existingSecret.SecretValue,
						ProjectID:   destination.ProjectID,
						Environment: destination.EnvironmentSlug,
						SecretPath:  destination.SecretsPath,
					})

					if err != nil {
						secretsFailedToReplaceById = append(secretsFailedToReplaceById, managedSecretKey)
						logger.Info(fmt.Sprintf("unable to create secret [key=%s] [err=%s]", managedSecretKey, err))
						continue
					}

					delete(infisicalPushSecret.Status.ManagedSecrets, deletedSecret.ID)
					infisicalPushSecret.Status.ManagedSecrets[createdSecret.ID] = managedSecretKey
				}

			}
		}

		// We need to check if any of the secrets have been removed in the new kube secret
		for _, managedSecretKey := range infisicalPushSecret.Status.ManagedSecrets {

			if _, ok := kubeSecrets[managedSecretKey]; !ok {

				// Secret has been removed, verify that the secret is managed by the operator
				if getExistingSecretByKey(managedSecretKey) != nil {
					logger.Info(fmt.Sprintf("Secret with key [key=%s] has been removed from the kube secret. Deleting secret from Infisical", managedSecretKey))

					deletedSecret, err := infisicalClient.Secrets().Delete(infisicalSdk.DeleteSecretOptions{
						SecretKey:   managedSecretKey,
						ProjectID:   destination.ProjectID,
						Environment: destination.EnvironmentSlug,
						SecretPath:  destination.SecretsPath,
					})

					if err != nil {
						secretsFailedToDelete = append(secretsFailedToDelete, managedSecretKey)
						logger.Info(fmt.Sprintf("unable to delete secret [key=%s] [err=%s]", managedSecretKey, err))
						continue
					}

					delete(infisicalPushSecret.Status.ManagedSecrets, deletedSecret.ID)
				}
			}
		}

		// We need to check if any new secrets have been added in the kube secret
		for currentSecretKey := range kubeSecrets {

			if !existingSecretsContainsKey(currentSecretKey) {

				// Some secrets has been added, verify that the secret that has been added is not already managed by the operator
				if _, ok := infisicalPushSecret.Status.ManagedSecrets[currentSecretKey]; !ok {

					// Secret was not managed by the operator, lets add it
					logger.Info(fmt.Sprintf("Secret with key [key=%s] has been added to the kube secret. Creating secret in Infisical", currentSecretKey))

					createdSecret, err := infisicalClient.Secrets().Create(infisicalSdk.CreateSecretOptions{
						SecretKey:   currentSecretKey,
						SecretValue: kubeSecrets[currentSecretKey],
						ProjectID:   destination.ProjectID,
						Environment: destination.EnvironmentSlug,
						SecretPath:  destination.SecretsPath,
					})

					if err != nil {
						secretsFailedToCreate = append(secretsFailedToCreate, currentSecretKey)
						logger.Info(fmt.Sprintf("unable to create secret [key=%s] [err=%s]", currentSecretKey, err))
						continue
					}

					infisicalPushSecret.Status.ManagedSecrets[createdSecret.ID] = currentSecretKey
				}
			} else {
				if updatePolicy == string(constants.PUSH_SECRET_REPLACE_POLICY_ENABLED) {
					updatedSecret, err := infisicalClient.Secrets().Update(infisicalSdk.UpdateSecretOptions{
						SecretKey:      currentSecretKey,
						NewSecretValue: kubeSecrets[currentSecretKey],
						ProjectID:      destination.ProjectID,
						Environment:    destination.EnvironmentSlug,
						SecretPath:     destination.SecretsPath,
					})

					if err != nil {
						secretsFailedToUpdate = append(secretsFailedToUpdate, currentSecretKey)
						logger.Info(fmt.Sprintf("unable to update secret [key=%s] [err=%s]", currentSecretKey, err))
						continue
					}

					infisicalPushSecret.Status.ManagedSecrets[updatedSecret.ID] = currentSecretKey
				}
			}
		}

		// Check if any of the existing secrets values have changed
		for secretKey, secretValue := range kubeSecrets {

			existingSecret := getExistingSecretByKey(secretKey)

			if existingSecret != nil {

				_, managedByOperator := infisicalPushSecret.Status.ManagedSecrets[existingSecret.ID]

				if secretValue != existingSecret.SecretValue {

					if managedByOperator || updatePolicy == string(constants.PUSH_SECRET_REPLACE_POLICY_ENABLED) {
						logger.Info(fmt.Sprintf("Secret with key [key=%s] has changed value. Updating secret in Infisical", secretKey))

						updatedSecret, err := infisicalClient.Secrets().Update(infisicalSdk.UpdateSecretOptions{
							SecretKey:      secretKey,
							NewSecretValue: secretValue,
							ProjectID:      destination.ProjectID,
							Environment:    destination.EnvironmentSlug,
							SecretPath:     destination.SecretsPath,
						})

						if err != nil {
							secretsFailedToUpdate = append(secretsFailedToUpdate, secretKey)
							logger.Info(fmt.Sprintf("unable to update secret [key=%s] [err=%s]", secretKey, err))
							continue
						}

						infisicalPushSecret.Status.ManagedSecrets[updatedSecret.ID] = secretKey
					}
				}
			}
		}
	}

	var errorMessage string
	if len(secretsFailedToCreate) > 0 {
		errorMessage = fmt.Sprintf("Failed to create secrets: [%s]", strings.Join(secretsFailedToCreate, ", "))
	} else {
		errorMessage = ""
	}
	r.SetFailedToCreateSecretsConditions(ctx, &infisicalPushSecret, fmt.Sprintf("Failed to create secrets: [%s]", errorMessage))

	if len(secretsFailedToUpdate) > 0 {
		errorMessage = fmt.Sprintf("Failed to update secrets: [%s]", strings.Join(secretsFailedToUpdate, ", "))
	} else {
		errorMessage = ""
	}
	r.SetFailedToUpdateSecretsConditions(ctx, &infisicalPushSecret, fmt.Sprintf("Failed to update secrets: [%s]", errorMessage))

	if len(secretsFailedToDelete) > 0 {
		errorMessage = fmt.Sprintf("Failed to delete secrets: [%s]", strings.Join(secretsFailedToDelete, ", "))
	} else {
		errorMessage = ""
	}
	r.SetFailedToDeleteSecretsConditions(ctx, &infisicalPushSecret, errorMessage)

	if len(secretsFailedToReplaceById) > 0 {
		errorMessage = fmt.Sprintf("Failed to replace secrets: [%s]", strings.Join(secretsFailedToReplaceById, ", "))
	} else {
		errorMessage = ""
	}
	r.SetFailedToReplaceSecretsConditions(ctx, &infisicalPushSecret, errorMessage)

	// Update the status of the InfisicalPushSecret
	if err := r.Client.Status().Update(ctx, &infisicalPushSecret); err != nil {
		return fmt.Errorf("unable to update status of InfisicalPushSecret [err=%s]", err)
	}

	return nil

}

func (r *InfisicalPushSecretReconciler) DeleteManagedSecrets(ctx context.Context, logger logr.Logger, infisicalPushSecret v1alpha1.InfisicalPushSecret) error {
	if infisicalPushSecret.Spec.DeletionPolicy != string(constants.PUSH_SECRET_DELETE_POLICY_ENABLED) {
		return nil
	}

	resourceVariables := r.getResourceVariables(infisicalPushSecret)
	infisicalClient := resourceVariables.InfisicalClient

	destination := infisicalPushSecret.Spec.Destination
	existingSecrets, err := infisicalClient.Secrets().List(infisicalSdk.ListSecretsOptions{
		ProjectID:      destination.ProjectID,
		Environment:    destination.EnvironmentSlug,
		SecretPath:     destination.SecretsPath,
		IncludeImports: false,
	})

	if err != nil {
		return fmt.Errorf("unable to list secrets [err=%s]", err)
	}

	existingSecretsMappedById := make(map[string]infisicalSdk.Secret)
	for _, secret := range existingSecrets {
		existingSecretsMappedById[secret.ID] = secret
	}

	for managedSecretId, managedSecretKey := range infisicalPushSecret.Status.ManagedSecrets {

		if _, ok := existingSecretsMappedById[managedSecretId]; ok {
			logger.Info(fmt.Sprintf("Deleting secret with key [key=%s]", managedSecretKey))

			_, err := infisicalClient.Secrets().Delete(infisicalSdk.DeleteSecretOptions{
				SecretKey:   managedSecretKey,
				ProjectID:   destination.ProjectID,
				Environment: destination.EnvironmentSlug,
				SecretPath:  destination.SecretsPath,
			})

			if err != nil {
				logger.Info(fmt.Sprintf("unable to delete secret [key=%s] [err=%s]", managedSecretKey, err))
				continue
			}
		}

	}

	return nil
}