export {};
declare global {
  interface Window {
    DTLead?: {
      prepare: (formId: string, payload: object) => { body: string; submissionId: string; confirmed: boolean };
      submit: (formId: string, payload: object, endpoint?: string) => Promise<Response>;
      claimConversion: (formId: string, response?: Response) => boolean;
      attribution: (formId: string, response?: Response) => Record<string, string>;
      reset: (formId: string) => void;
      begin: (formId: string) => void;
    };
  }
}
