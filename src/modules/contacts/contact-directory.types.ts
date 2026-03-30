export type ContactDirectoryItem = {
  id: string;
  title: string;
  keywords: string[];
  contactName: string;
  team?: string;
  description: string;
  actionHint?: string;
};

export type ContactDirectoryResolveInput = {
  query: string;
};

export type ContactDirectoryResolution = {
  title: string;
  contactName: string;
  team?: string;
  description: string;
  actionHint?: string;
};
