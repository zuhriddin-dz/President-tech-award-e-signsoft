import Link from 'next/link';
import { Building2, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { API_PATHS, WorkspaceMemberListSchema } from '@docflow/contracts';
import { Avatar, Card, CardHeader, Pill, Td, Th } from '@/components/ui/primitives';
import { apiGet } from '@/lib/api';
import { loadMe } from '@/lib/queries';
import { shortDate } from '@/lib/format';

/**
 * Admin — the workspace itself: who is in it, how it is isolated, and where
 * identity is managed. Membership is Clerk's source of truth, so this page
 * reports and links out rather than duplicating the invite flow.
 */
export default async function AdminPage() {
  const [me, memberList] = await Promise.all([
    loadMe(),
    apiGet(`${API_PATHS.me}/members`, WorkspaceMemberListSchema),
  ]);

  const tenant = me.status === 'ok' ? me.data.tenant : null;
  const myRole = me.status === 'ok' ? me.data.role : null;
  const members = memberList?.members ?? [];
  const isCompany = tenant?.kind === 'company';

  return (
    <div className="mx-auto w-full max-w-[1360px] px-8 py-7">
      <h1 className="text-3xl font-semibold text-ink">Admin</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Settings for {tenant?.name ?? 'this workspace'}.
      </p>

      <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="Members"
              action={
                isCompany ? (
                  <span className="text-sm text-ink-muted">
                    Invite people from the workspace switcher in the top bar
                  </span>
                ) : undefined
              }
            />
            {members.length === 0 ? (
              <p className="px-6 pb-8 text-sm text-ink-muted">
                No members found for this workspace.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-y border-border">
                      <Th>Person</Th>
                      <Th>Role</Th>
                      <Th>Joined</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-b-0">
                        <Td>
                          <div className="flex items-center gap-3">
                            <Avatar name={m.email} size={34} />
                            <span className="font-medium">{m.email}</span>
                          </div>
                        </Td>
                        <Td>
                          <Pill
                            tone={m.role === 'OWNER' ? 'info' : 'neutral'}
                            label={m.role.toLowerCase()}
                          />
                        </Td>
                        <Td className="text-ink-muted">{shortDate(m.joinedAt)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!isCompany && (
              <p className="border-t border-border px-6 py-4 text-sm text-ink-muted">
                This is a personal workspace, so it has exactly one member — you. Create a company
                workspace to sign alongside colleagues.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="How your data is isolated" />
            <div className="grid grid-cols-1 gap-5 px-6 pb-6 sm:grid-cols-2">
              {[
                [
                  'Enforced by the database',
                  'Every row carries a workspace id, and the database refuses to return rows belonging to anyone else — the rule is not in application code, so a bug in it cannot leak your documents.',
                ],
                [
                  'Signing links are single-use',
                  'A link is a one-time secret stored only as a hash. Once used, cancelled, or expired, it resolves to nothing at all.',
                ],
                [
                  'Every signed file is sealed',
                  'The finished PDF is fingerprinted and signed with an Ed25519 key. Alter a single byte and verification fails.',
                ],
                [
                  'The public signing app holds nothing',
                  'It has no database and no keys — it forwards a fixed set of requests and can do nothing else, even if it is compromised.',
                ],
              ].map(([title, body]) => (
                <div key={title} className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <div>
                    <p className="font-semibold text-ink">{title}</p>
                    <p className="mt-1 text-sm text-ink-muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Workspace" />
            <dl className="px-6 pb-6">
              {(
                [
                  ['Name', tenant?.name ?? '—', <Building2 key="i" className="h-4 w-4" />],
                  [
                    'Type',
                    tenant?.kind === 'personal' ? 'Personal' : 'Company',
                    <UserRound key="i" className="h-4 w-4" />,
                  ],
                  ['Your role', myRole?.toLowerCase() ?? '—', <KeyRound key="i" className="h-4 w-4" />],
                  ['Created', tenant ? shortDate(tenant.createdAt) : '—', null],
                  ['Workspace id', tenant?.id ?? '—', null],
                ] as const
              ).map(([label, value, icon]) => (
                <div key={label} className="flex items-start gap-3 border-b border-border py-3.5 last:border-b-0">
                  <span className="w-32 shrink-0 text-sm text-ink-muted">{label}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm break-all text-ink">
                    {icon}
                    {value}
                  </span>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Identity" />
            <div className="px-6 pb-6 text-sm text-ink-muted">
              <p>
                Sign-in, passwords, multi-factor and workspace invitations are handled by our
                identity provider — DocFlow never stores a password.
              </p>
              <Link
                href="/account"
                className="mt-3 inline-block font-semibold text-brand-link hover:underline"
              >
                Manage your account
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
