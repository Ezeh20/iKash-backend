import { Prisma } from '@prisma/client';

export const PAYMENT_PROVIDER_SELECT = {
  provider_id: true,
  name: true,
  type: true,
  country_code: true,
  is_active: true,
  metadata: true,
} satisfies Prisma.payment_providerSelect;

export const PAYMENT_METHOD_SELECT = {
  paymentId: true,
  userId: true,
  providerId: true,
  type: true,
  accountIdentifier: true,
  beneficiaryName: true,
  description: true,
  isActive: true,
  payment_provider: { select: PAYMENT_PROVIDER_SELECT },
} satisfies Prisma.PaymentMethodSelect;

export const ORDER_PARTY_SELECT = {
  userId: true,
  publicKey: true,
  alias: true,
  username: true,
  profileImageUrl: true,
} satisfies Prisma.AppUserSelect;

export const ORDER_PARTY_CONTACT_SELECT = {
  userId: true,
  alias: true,
  publicKey: true,
} satisfies Prisma.AppUserSelect;

export const USER_PUBLIC_SELECT = {
  userId: true,
  publicKey: true,
  alias: true,
  username: true,
  kycStatus: true,
  role: true,
  kycUpdatedAt: true,
  totalVolume: true,
  createdAt: true,
  email: true,
  profileImageUrl: true,
  notificationsEnabled: true,
  pendingAccountInfo: true,
  preferredCurrency: true,
  bio: true,
  securityUpdates: true,
} satisfies Prisma.AppUserSelect;

export type OrderParty = Prisma.AppUserGetPayload<{
  select: typeof ORDER_PARTY_SELECT;
}>;

export type OrderPartyContact = Prisma.AppUserGetPayload<{
  select: typeof ORDER_PARTY_CONTACT_SELECT;
}>;

export type PublicUser = Prisma.AppUserGetPayload<{
  select: typeof USER_PUBLIC_SELECT;
}>;
