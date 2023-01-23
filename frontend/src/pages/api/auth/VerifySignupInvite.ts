import { BACKEND_API_URL } from '~/components/utilities/config';

interface Props {
  email: string;
  code: string;
}

/**
 * This route verifies the signup invite link
 * @param {object} obj
 * @param {string} obj.email - email that a user is trying to verify
 * @param {string} obj.code - code that a user received to the mentioned above email
 * @returns
 */
const verifySignupInvite = ({ email, code }: Props) =>
  fetch(`${BACKEND_API_URL}/v1/invite-org/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      code
    })
  });

export default verifySignupInvite;
