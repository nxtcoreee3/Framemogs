export const state = {
  session: null,
  user: null,
  profile: null, // viewer profile row (if approved)
  roles: new Set(), // "owner" | "mod"
};
