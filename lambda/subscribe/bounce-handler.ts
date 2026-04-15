import { SNSEvent } from 'aws-lambda';
import { setSubscriberStatus } from './db';

interface SESBounceNotification {
  notificationType: 'Bounce';
  bounce: {
    bounceType: 'Permanent' | 'Transient' | 'Undetermined';
    bouncedRecipients: { emailAddress: string }[];
  };
}

interface SESComplaintNotification {
  notificationType: 'Complaint';
  complaint: {
    complainedRecipients: { emailAddress: string }[];
  };
}

type SESNotification = SESBounceNotification | SESComplaintNotification;

export const handler = async (event: SNSEvent): Promise<void> => {
  for (const record of event.Records) {
    let notification: SESNotification;
    try {
      notification = JSON.parse(record.Sns.Message) as SESNotification;
    } catch {
      console.error('Failed to parse SNS message:', record.Sns.Message);
      continue;
    }

    if (notification.notificationType === 'Bounce') {
      const bounce = (notification as SESBounceNotification).bounce;
      // Only suppress on permanent bounces; log transient ones
      if (bounce.bounceType === 'Permanent') {
        for (const recipient of bounce.bouncedRecipients) {
          console.log(`Marking ${recipient.emailAddress} as bounced`);
          await setSubscriberStatus(recipient.emailAddress, 'bounced');
        }
      } else {
        console.log(`Transient bounce for: ${bounce.bouncedRecipients.map(r => r.emailAddress).join(', ')} — not suppressing`);
      }
    } else if (notification.notificationType === 'Complaint') {
      const complaint = (notification as SESComplaintNotification).complaint;
      for (const recipient of complaint.complainedRecipients) {
        console.log(`Marking ${recipient.emailAddress} as complained`);
        await setSubscriberStatus(recipient.emailAddress, 'complained');
      }
    } else {
      console.log('Unhandled notification type:', (notification as SESNotification).notificationType);
    }
  }
};
