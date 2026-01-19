/**
 * Starter Decks for new players
 * One pre-built deck per division using actual unit IDs from rosters
 */

import type { DeckData } from './types';

export const STARTER_DECKS: DeckData[] = [
  // ============ SDF Starter Decks ============
  
  // SDF 7th Mechanized - Balanced mechanized force
  {
    id: 'starter_sdf_7th_mechanized',
    name: '7th Mechanized Starter',
    divisionId: 'sdf_7th_mechanized',
    units: [
      { unitId: 'sdf_trooper', veterancy: 0 },
      { unitId: 'sdf_trooper', veterancy: 0 },
      { unitId: 'sdf_militia', veterancy: 0 },
      { unitId: 'sdf_hwt_heavy_bolter', veterancy: 0 },
      { unitId: 'sdf_hwt_missile', veterancy: 0 },
      { unitId: 'sdf_bastion_mbt', veterancy: 0 },
      { unitId: 'sdf_scout_walker', veterancy: 0 },
      { unitId: 'sdf_skysweeper', veterancy: 0 },
      { unitId: 'sdf_field_gun_bombast', veterancy: 0 },
      { unitId: 'sdf_falcon_gunship_rotary', veterancy: 0 },
    ],
    activationPoints: 24,
  },
  
  // SDF 212th Heavy Armor - Tank-heavy force
  {
    id: 'starter_sdf_212th_heavy_armor',
    name: '212th Heavy Armor Starter',
    divisionId: 'sdf_212th_heavy_armor',
    units: [
      { unitId: 'sdf_trooper', veterancy: 0 },
      { unitId: 'sdf_engineer', veterancy: 0 },
      { unitId: 'sdf_bastion_mbt', veterancy: 0 },
      { unitId: 'sdf_bastion_mbt', veterancy: 0 },
      { unitId: 'sdf_bastion_mbt_hunter', veterancy: 0 },
      { unitId: 'sdf_scout_walker', veterancy: 0 },
      { unitId: 'sdf_skysweeper', veterancy: 0 },
      { unitId: 'sdf_tremor_cannon', veterancy: 0 },
      { unitId: 'sdf_nova_fighter_strike', veterancy: 0 },
    ],
    activationPoints: 26,
  },
  
  // SDF 45th Siege - Artillery focus
  {
    id: 'starter_sdf_45th_siege',
    name: '45th Siege Starter',
    divisionId: 'sdf_45th_siege',
    units: [
      { unitId: 'sdf_trooper', veterancy: 0 },
      { unitId: 'sdf_militia', veterancy: 0 },
      { unitId: 'sdf_hwt_lascannon', veterancy: 0 },
      { unitId: 'sdf_mortar_team', veterancy: 0 },
      { unitId: 'sdf_tremor_cannon', veterancy: 0 },
      { unitId: 'sdf_tremor_cannon', veterancy: 0 },
      { unitId: 'sdf_barrage_launcher', veterancy: 0 },
      { unitId: 'sdf_field_gun_bombast', veterancy: 0 },
      { unitId: 'sdf_scout_walker', veterancy: 0 },
      { unitId: 'sdf_skysweeper', veterancy: 0 },
    ],
    activationPoints: 25,
  },
  
  // SDF 101st Airborne - Air assault focus
  {
    id: 'starter_sdf_101st_airborne',
    name: '101st Airborne Starter',
    divisionId: 'sdf_101st_airborne',
    units: [
      { unitId: 'sdf_stormtrooper', veterancy: 0 },
      { unitId: 'sdf_stormtrooper', veterancy: 0 },
      { unitId: 'sdf_trooper', veterancy: 0 },
      { unitId: 'sdf_hwt_lascannon', veterancy: 0 },
      { unitId: 'sdf_rocket_team', veterancy: 0 },
      { unitId: 'sdf_falcon_gunship_rotary', veterancy: 0 },
      { unitId: 'sdf_falcon_gunship_at', veterancy: 0 },
      { unitId: 'sdf_nova_fighter_interceptor', veterancy: 0 },
      { unitId: 'sdf_scout_walker', veterancy: 0 },
      { unitId: 'sdf_skysweeper', veterancy: 0 },
    ],
    activationPoints: 27,
  },
  
  // ============ Vanguard Starter Decks ============
  
  // Vanguard 1st Veteran - Elite exo-armor focus
  {
    id: 'starter_vanguard_1st_veteran',
    name: '1st Veteran Starter',
    divisionId: 'vanguard_1st_veteran',
    units: [
      { unitId: 'vanguard_exo_armor_kinetic', veterancy: 1 },
      { unitId: 'vanguard_exo_armor_shock', veterancy: 1 },
      { unitId: 'vanguard_infantry', veterancy: 0 },
      { unitId: 'vanguard_recon', veterancy: 0 },
      { unitId: 'vanguard_fortress_tank', veterancy: 0 },
      { unitId: 'vanguard_iron_walker_assault', veterancy: 0 },
      { unitId: 'vanguard_hunter_tank', veterancy: 0 },
      { unitId: 'vanguard_raven_hunter', veterancy: 0 },
      { unitId: 'vanguard_heavy_support_auto', veterancy: 0 },
    ],
    activationPoints: 28,
  },
  
  // Vanguard 2nd Battle - Balanced tactical force
  {
    id: 'starter_vanguard_2nd_battle',
    name: '2nd Battle Starter',
    divisionId: 'vanguard_2nd_battle',
    units: [
      { unitId: 'vanguard_infantry', veterancy: 0 },
      { unitId: 'vanguard_infantry', veterancy: 0 },
      { unitId: 'vanguard_infantry_fusion', veterancy: 0 },
      { unitId: 'vanguard_jetpack_squad', veterancy: 0 },
      { unitId: 'vanguard_recon', veterancy: 0 },
      { unitId: 'vanguard_hunter_tank', veterancy: 0 },
      { unitId: 'vanguard_iron_walker_assault', veterancy: 0 },
      { unitId: 'vanguard_swift_skimmer_auto', veterancy: 0 },
      { unitId: 'vanguard_heavy_support_laser', veterancy: 0 },
      { unitId: 'vanguard_talon_interceptor', veterancy: 0 },
    ],
    activationPoints: 25,
  },
  
  // Vanguard 8th Assault - Fast attack focus
  {
    id: 'starter_vanguard_8th_assault',
    name: '8th Assault Starter',
    divisionId: 'vanguard_8th_assault',
    units: [
      { unitId: 'vanguard_jetpack_squad', veterancy: 0 },
      { unitId: 'vanguard_jetpack_squad', veterancy: 0 },
      { unitId: 'vanguard_infantry_fusion', veterancy: 0 },
      { unitId: 'vanguard_outrider', veterancy: 0 },
      { unitId: 'vanguard_swift_skimmer_fusion', veterancy: 0 },
      { unitId: 'vanguard_recon_bike', veterancy: 0 },
      { unitId: 'vanguard_hunter_tank_laser', veterancy: 0 },
      { unitId: 'vanguard_raven_dropship', veterancy: 0 },
      { unitId: 'vanguard_heavy_support_auto', veterancy: 0 },
    ],
    activationPoints: 26,
  },
  
  // Vanguard 10th Scout - Recon/flanking focus
  {
    id: 'starter_vanguard_10th_scout',
    name: '10th Scout Starter',
    divisionId: 'vanguard_10th_scout',
    units: [
      { unitId: 'vanguard_recon', veterancy: 0 },
      { unitId: 'vanguard_recon', veterancy: 0 },
      { unitId: 'vanguard_recon_sniper', veterancy: 0 },
      { unitId: 'vanguard_infantry', veterancy: 0 },
      { unitId: 'vanguard_outrider', veterancy: 0 },
      { unitId: 'vanguard_swift_skimmer_auto', veterancy: 0 },
      { unitId: 'vanguard_swift_skimmer_missile', veterancy: 0 },
      { unitId: 'vanguard_recon_bike', veterancy: 0 },
      { unitId: 'vanguard_hunter_tank', veterancy: 0 },
      { unitId: 'vanguard_talon_interceptor', veterancy: 0 },
    ],
    activationPoints: 24,
  },
];

/**
 * Get starter decks for a specific faction
 */
export function getStarterDecksByFaction(factionId: string): DeckData[] {
  const factionPrefix = factionId === 'sdf' ? 'starter_sdf' : 'starter_vanguard';
  return STARTER_DECKS.filter(deck => deck.id.startsWith(factionPrefix));
}

/**
 * Get a specific starter deck by ID
 */
export function getStarterDeckById(deckId: string): DeckData | undefined {
  return STARTER_DECKS.find(deck => deck.id === deckId);
}

/**
 * Get starter decks for a specific division
 */
export function getStarterDeckByDivision(divisionId: string): DeckData | undefined {
  return STARTER_DECKS.find(deck => deck.divisionId === divisionId);
}
