/**
 * Pure faction data for Stellar Siege
 * No Vite/DOM dependencies - safe for server and client use
 */

import type { FactionData } from './types';

export const FACTIONS: FactionData[] = [
  {
    id: 'sdf',
    name: 'System Defense Force',
    description: 'Local garrison forces defending their homeworld. Rely on numbers, entrenchment, and knowledge of terrain.',
    color: '#00aaff',
    icon: '/assets/icons/factions/sdf_faction_icon_main.png',
    flag: '/assets/icons/factions/sdf_flag.png',
  },
  {
    id: 'vanguard',
    name: 'Vanguard Legions',
    description: 'Elite assault forces specialized in planetary siege warfare. Superior firepower and armor.',
    color: '#ff4444',
    icon: '/assets/icons/factions/vanguard_faction_icon_main.png',
    flag: '/assets/icons/factions/vanguard_flag.png',
  },
];

export function getFactionById(id: string): FactionData | undefined {
  return FACTIONS.find((f) => f.id === id);
}
