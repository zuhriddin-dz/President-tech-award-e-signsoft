import { GetPro } from '@/components/billing/get-pro';

/**
 * Plans and billing. The content is GetPro, because the shell shows that same
 * page in place of every other one once a workspace's trial has ended.
 */
export default function BillingPage() {
  return <GetPro />;
}
