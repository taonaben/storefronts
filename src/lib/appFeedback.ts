import { toast } from "sonner";

type FeedbackOptions = {
  title: string;
  description?: string;
};

const DEFAULT_DURATION_MS = 4_500;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Something went wrong. Please try again.";
}

export const appFeedback = {
  success({ title, description }: FeedbackOptions) {
    toast.success(title, {
      description,
      duration: DEFAULT_DURATION_MS,
    });
  },

  error({ title, description }: FeedbackOptions) {
    toast.error(title, {
      description,
      duration: 6_000,
    });
  },

  info({ title, description }: FeedbackOptions) {
    toast(title, {
      description,
      duration: DEFAULT_DURATION_MS,
    });
  },

  errorFromUnknown(error: unknown, title = "Action failed") {
    appFeedback.error({
      title,
      description: getErrorMessage(error),
    });
  },
};

