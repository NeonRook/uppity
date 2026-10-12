/** The user's email when verified, else null: unverified addresses are attacker-chosen text. */
export const verifiedEmail = (user: { email: string; emailVerified: boolean }) =>
	user.emailVerified ? user.email : null;
