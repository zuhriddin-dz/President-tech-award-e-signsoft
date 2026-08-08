import { PageLoader } from '@/components/ui/spinner';

/**
 * Route-level loading UI. Next shows this while a server component is
 * fetching, which for this app means "while the API is being called" — the
 * document list, a request's detail, the reports page.
 *
 * Without it the browser simply sits on the previous page with no feedback,
 * and the app feels like it has ignored the click.
 */
export default function Loading() {
  return <PageLoader label="Loading" />;
}
