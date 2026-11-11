// v1.52.1 (owner: "wherever we select a name, the format should be Name -
// Employee code, and the department below"): one way to write a person.
// The employee code is the person's User ID.
export const personLabel = (person: { name: string; loginId: string }) => `${person.name} - ${person.loginId}`;
