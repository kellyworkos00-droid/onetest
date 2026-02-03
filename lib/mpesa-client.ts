/**
 * Kelly OS — M-Pesa Daraja API Client
 * 
 * PURPOSE:
 * Interact with Safaricom M-Pesa Daraja API for:
 * - C2B registration
 * - STK Push (future)
 * - Transaction status queries
 * - Account balance
 */

import axios from 'axios';

// ============================================================================
// TYPES
// ============================================================================

interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  environment: 'sandbox' | 'production';
  callbackUrl: string;
}

interface C2BRegisterParams {
  shortCode: string;
  responseType: 'Completed' | 'Cancelled';
  confirmationURL: string;
  validationURL: string;
}

// ============================================================================
// M-PESA API CLIENT
// ============================================================================

export class MpesaClient {
  private config: MpesaConfig;
  private baseUrl: string;
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(config: MpesaConfig) {
    this.config = config;
    this.baseUrl =
      config.environment === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';
  }

  /**
   * Get OAuth access token
   * Tokens are valid for 1 hour
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    const auth = Buffer.from(
      `${this.config.consumerKey}:${this.config.consumerSecret}`
    ).toString('base64');

    const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    this.accessToken = response.data.access_token;
    // Set expiry to 55 minutes from now (token valid for 1 hour)
    this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);

    return this.accessToken!;
  }

  /**
   * Register C2B URLs
   * This tells Safaricom where to send payment callbacks
   * 
   * CRITICAL: Run this once during setup
   */
  async registerC2B(params?: Partial<C2BRegisterParams>): Promise<any> {
    const token = await this.getAccessToken();

    const payload = {
      ShortCode: params?.shortCode || this.config.shortCode,
      ResponseType: params?.responseType || 'Completed',
      ConfirmationURL: params?.confirmationURL || this.config.callbackUrl,
      ValidationURL: params?.validationURL || this.config.callbackUrl,
    };

    const response = await axios.post(
      `${this.baseUrl}/mpesa/c2b/v1/registerurl`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ C2B URLs registered:', response.data);
    return response.data;
  }

  /**
   * Simulate C2B payment (Sandbox only)
   * Use this for testing in sandbox environment
   */
  async simulateC2B(params: {
    amount: number;
    msisdn: string; // Phone: 254712345678
    billRefNumber: string; // Account number
  }): Promise<any> {
    if (this.config.environment !== 'sandbox') {
      throw new Error('C2B simulation only available in sandbox');
    }

    const token = await this.getAccessToken();

    const payload = {
      ShortCode: this.config.shortCode,
      CommandID: 'CustomerPayBillOnline',
      Amount: params.amount,
      Msisdn: params.msisdn,
      BillRefNumber: params.billRefNumber,
    };

    const response = await axios.post(`${this.baseUrl}/mpesa/c2b/v1/simulate`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('💰 C2B payment simulated:', response.data);
    return response.data;
  }

  /**
   * Query transaction status
   * Check status of a specific M-Pesa transaction
   */
  async queryTransactionStatus(params: {
    transactionID: string;
    partyA: string; // Phone number
    identifierType: '1' | '2' | '4'; // 1=MSISDN, 2=Till, 4=Shortcode
    resultURL: string;
    queueTimeOutURL: string;
  }): Promise<any> {
    const token = await this.getAccessToken();

    const payload = {
      Initiator: 'testapi', // Replace with actual initiator name
      SecurityCredential: 'encrypted_password', // TODO: Encrypt initiator password
      CommandID: 'TransactionStatusQuery',
      TransactionID: params.transactionID,
      PartyA: params.partyA,
      IdentifierType: params.identifierType,
      ResultURL: params.resultURL,
      QueueTimeOutURL: params.queueTimeOutURL,
      Remarks: 'Transaction status query',
      Occasion: 'Query',
    };

    const response = await axios.post(
      `${this.baseUrl}/mpesa/transactionstatus/v1/query`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  /**
   * Check account balance
   * Get M-Pesa account balance
   */
  async checkAccountBalance(params: {
    resultURL: string;
    queueTimeOutURL: string;
  }): Promise<any> {
    const token = await this.getAccessToken();

    const payload = {
      Initiator: 'testapi', // Replace with actual initiator name
      SecurityCredential: 'encrypted_password', // TODO: Encrypt initiator password
      CommandID: 'AccountBalance',
      PartyA: this.config.shortCode,
      IdentifierType: '4', // 4 = Shortcode
      Remarks: 'Balance query',
      QueueTimeOutURL: params.queueTimeOutURL,
      ResultURL: params.resultURL,
    };

    const response = await axios.post(`${this.baseUrl}/mpesa/accountbalance/v1/query`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return response.data;
  }

  /**
   * Reverse a transaction
   * Reverses an M-Pesa transaction
   */
  async reverseTransaction(params: {
    transactionID: string;
    amount: number;
    receiverParty: string;
    resultURL: string;
    queueTimeOutURL: string;
    remarks?: string;
    occasion?: string;
  }): Promise<any> {
    const token = await this.getAccessToken();

    const payload = {
      Initiator: 'testapi',
      SecurityCredential: 'encrypted_password',
      CommandID: 'TransactionReversal',
      TransactionID: params.transactionID,
      Amount: params.amount,
      ReceiverParty: params.receiverParty,
      RecieverIdentifierType: '11', // 11 = Till Number
      ResultURL: params.resultURL,
      QueueTimeOutURL: params.queueTimeOutURL,
      Remarks: params.remarks || 'Transaction reversal',
      Occasion: params.occasion || '',
    };

    const response = await axios.post(
      `${this.baseUrl}/mpesa/reversal/v1/request`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  /**
   * B2C Payment Request
   * Send money to customer
   */
  async b2cPayment(params: {
    amount: number;
    phoneNumber: string;
    remarks: string;
    occasion?: string;
    resultURL: string;
    queueTimeOutURL: string;
  }): Promise<any> {
    const token = await this.getAccessToken();

    const payload = {
      InitiatorName: 'testapi',
      SecurityCredential: 'encrypted_password',
      CommandID: 'BusinessPayment', // or 'SalaryPayment', 'PromotionPayment'
      Amount: params.amount,
      PartyA: this.config.shortCode,
      PartyB: params.phoneNumber,
      Remarks: params.remarks,
      QueueTimeOutURL: params.queueTimeOutURL,
      ResultURL: params.resultURL,
      Occasion: params.occasion || '',
    };

    const response = await axios.post(
      `${this.baseUrl}/mpesa/b2c/v1/paymentrequest`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create M-Pesa client from environment variables
 */
export function createMpesaClient(): MpesaClient {
  const config: MpesaConfig = {
    consumerKey: process.env.MPESA_CONSUMER_KEY!,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
    shortCode: process.env.MPESA_SHORT_CODE!,
    passkey: process.env.MPESA_PASSKEY!,
    environment: (process.env.MPESA_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    callbackUrl: process.env.MPESA_CALLBACK_URL!,
  };

  // Validate required env vars
  if (!config.consumerKey || !config.consumerSecret || !config.shortCode) {
    throw new Error('Missing M-Pesa configuration in environment variables');
  }

  return new MpesaClient(config);
}
