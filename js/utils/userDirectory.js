// utils/userDirectory.js

const devDirectory = {
  jaetill: 'Jason',
  ellie99: 'Ellie',
  maxwell: 'Max',
  rina_s: 'Rina',
};

export function getDisplayName(userId) {
  return devDirectory[userId] || userId;
}
