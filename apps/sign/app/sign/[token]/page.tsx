import { Ceremony } from './ceremony';

/** Public signing page. The token is the only credential; the ceremony runs
 * entirely through the same-origin relay. */
export default async function SignPageRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Ceremony token={token} />;
}
