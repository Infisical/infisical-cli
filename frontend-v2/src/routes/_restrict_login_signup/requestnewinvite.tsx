import { Helmet } from "react-helmet";
import { createFileRoute } from "@tanstack/react-router";

/**
 * This is the page that shows up when a user's invitation
 * to join a project/organization on Infisical has expired
 */
const RequestNewInvitePage = () => {
  return (
    <div className="flex flex-col justify-between bg-bunker-700 md:h-screen">
      <Helmet>
        <title>Request a New Invite</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="mt-8 flex h-screen w-screen flex-col items-center justify-center text-bunker-200">
        <p className="text-4xl text-primary-100">Oops, your invite has expired.</p>
        <p className="my-4 text-lg">Ask your admin for a new one.</p>
        <p className="max-w-xs px-7 text-center text-sm leading-tight text-bunker-400">
          <span className="rounded-md bg-primary-500/40 px-1 text-black">Note:</span> If it still
          doesn&apos;t work, please reach out to us at support@infisical.com
        </p>
        <div className="">
          <img
            src="/images/invitation-expired.svg"
            height={500}
            width={800}
            alt="invitation expired illustration"
          />
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/_restrict_login_signup/requestnewinvite")({
  component: RequestNewInvitePage
});
