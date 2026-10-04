/** Account fields safe to return from administrative and membership endpoints. */
export const publicAccountSelect = {
  id: true,
  email: true,
  role: true,
  plan: true,
  isActive: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
