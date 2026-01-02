/**
 * Resend Email Integration
 * Handles transactional emails
 */

import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  console.warn('Resend API key not configured');
}

export const resend = new Resend(resendApiKey);

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(email: string, name?: string) {
  if (!resendApiKey) {
    console.warn('Resend not configured, skipping welcome email');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'AutoBalloon <noreply@autoballoon.com>',
      to: [email],
      subject: 'Welcome to AutoBalloon CIE! 🎈',
      html: `
        <h1>Welcome to AutoBalloon CIE${name ? `, ${name}` : ''}!</h1>
        <p>Thanks for signing up. You can now start ballooning your engineering drawings with AI-powered precision.</p>
        <h2>What's Next?</h2>
        <ul>
          <li>Upload your first PDF drawing</li>
          <li>Watch AI automatically detect and parse dimensions</li>
          <li>Export to AS9102 Form 3 Excel</li>
        </ul>
        <p>Questions? Just reply to this email.</p>
        <p>Happy ballooning!<br>The AutoBalloon Team</p>
      `,
    });

    if (error) {
      console.error('Resend email error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Failed to send welcome email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send subscription confirmation email
 */
export async function sendSubscriptionConfirmationEmail(
  email: string,
  planName: string,
  amount: string
) {
  if (!resendApiKey) {
    console.warn('Resend not configured, skipping subscription email');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'AutoBalloon <noreply@autoballoon.com>',
      to: [email],
      subject: `Your AutoBalloon ${planName} subscription is active! 🎉`,
      html: `
        <h1>Subscription Confirmed!</h1>
        <p>Your <strong>${planName}</strong> subscription (${amount}/month) is now active.</p>
        <h2>What You Get:</h2>
        <ul>
          ${planName === 'Light' ? `
            <li>30 uploads per day</li>
            <li>150 uploads per month</li>
          ` : `
            <li>100 uploads per day</li>
            <li>500 uploads per month</li>
            <li>Priority processing</li>
            <li>Revision comparison</li>
          `}
          <li>Full workbench access</li>
          <li>AS9102 Excel exports</li>
          <li>Ballooned PDF exports</li>
          <li>CMM import & matching</li>
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">Start using AutoBalloon →</a></p>
        <p>Questions? Just reply to this email.</p>
      `,
    });

    if (error) {
      console.error('Resend email error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Failed to send subscription email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send usage limit notification
 */
export async function sendUsageLimitEmail(
  email: string,
  limitType: 'daily' | 'monthly',
  currentPlan: string
) {
  if (!resendApiKey) {
    return { success: false, error: 'Email not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'AutoBalloon <noreply@autoballoon.com>',
      to: [email],
      subject: `AutoBalloon: ${limitType === 'daily' ? 'Daily' : 'Monthly'} limit reached`,
      html: `
        <h1>Usage Limit Reached</h1>
        <p>You've reached your ${limitType} upload limit on the <strong>${currentPlan}</strong> plan.</p>
        <h2>Options:</h2>
        <ul>
          ${limitType === 'daily' ? `
            <li>Wait for daily reset (midnight UTC)</li>
            <li>Upgrade to a higher tier for more uploads</li>
          ` : `
            <li>Wait for monthly reset (1st of next month)</li>
            <li>Upgrade to the Production plan for 500 uploads/month</li>
          `}
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">Upgrade your plan →</a></p>
      `,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
