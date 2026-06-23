// eslint-disable-next-line @typescript-eslint/no-require-imports
const AfricasTalking = require("africastalking");

let client: any = null;

function getClient() {
  if (!client) {
    client = AfricasTalking({
      apiKey: process.env.AT_API_KEY!,
      username: process.env.AT_USERNAME!,
    });
  }
  return client;
}

export interface AirtimeRecipient {
  phoneNumber: string;
  currencyCode: string;
  amount: number;
}

export interface AirtimeResult {
  numSent: number;
  errorMessage?: string; // top-level error from AT (e.g. duplicate request)
  totalAmount: string;
  totalDiscount: string;
  responses: Array<{
    phoneNumber: string;
    amount: string;
    discount: string;
    status: string;
    requestId: string;
    errorMessage: string;
  }>;
}

export async function sendAirtime(
  recipient: AirtimeRecipient
): Promise<AirtimeResult> {
  const airtime = getClient().AIRTIME;
  const result = await airtime.send({
    recipients: [recipient],
  });
  return result as AirtimeResult;
}
