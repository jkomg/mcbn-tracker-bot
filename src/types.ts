export type XpSpendCategory =
  | 'Attribute'
  | 'Skill'
  | 'New Skill'
  | 'Discipline (In-Clan)'
  | 'Discipline (Out-of-Clan)'
  | 'Caitiff Discipline'
  | 'Blood Sorcery Ritual'
  | 'Thin-Blood Alchemy Formula'
  | 'Advantage (Merit/Background)';

export type XpSummary = {
  characterName: string;
  earnedXp: number;
  totalXp: number;
  totalSpends: number;
  availableXp: number;
};

export type ClaimPayload = {
  characterName: string;
  playPeriod: string;
  categories: Record<string, string>;
};

export type SpendPayload = {
  characterName: string;
  spendCategory: XpSpendCategory;
  traitName: string;
  currentDots: number;
  newDots: number;
  isInClan: boolean;
  justification: string;
};
