/**
 * Starter Decks for new players
 * One pre-built deck per division using actual unit IDs from rosters
 * Each card uses veterancy 0 (trained) with quantity = trained availability
 * AP calculated from division slotCosts arrays (nth card of category = slotCosts[category][n-1])
 */

import type { DeckData } from './types';

export const STARTER_DECKS: DeckData[] = [
  // ============ SDF Starter Decks ============

  // SDF 7th Mechanized - Balanced mechanized force
  // LOG(4)=6 + INF(10)=13 + TNK(4)=8 + REC(2)=2 + AA(3)=5 + ART(3)=5 + HEL(2)=5 + AIR(2)=5 = 49 AP, 30 cards
  {
    id: 'starter_sdf_7th_mechanized',
    name: '7th Mechanized Starter',
    divisionId: 'sdf_7th_mechanized',
    units: [
      // LOG (4 cards)
      { unitId: 'sdf_armored_transport', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_armored_transport', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_transport_truck', veterancy: 0, quantity: 16 },
      { unitId: 'sdf_transport_truck', veterancy: 0, quantity: 16 },
      // INF (10 cards)
      { unitId: 'sdf_trooper', veterancy: 0, quantity: 5 },
      { unitId: 'sdf_trooper', veterancy: 0, quantity: 5 },
      { unitId: 'sdf_trooper_mech', veterancy: 0, quantity: 5 },
      { unitId: 'sdf_trooper_mech', veterancy: 0, quantity: 5 },
      { unitId: 'sdf_militia', veterancy: 0, quantity: 8 },
      { unitId: 'sdf_militia_motorised', veterancy: 0, quantity: 8 },
      { unitId: 'sdf_hwt_heavy_bolter', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_hwt_missile', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_engineer_mech', veterancy: 0, quantity: 6 },
      { unitId: 'sdf_centurion_apc', veterancy: 0, quantity: 8 },
      // TNK (4 cards)
      { unitId: 'sdf_bastion_mbt', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_bastion_mbt', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_bastion_mbt_rotary', veterancy: 0, quantity: 3 },
      { unitId: 'sdf_bastion_mbt_rotary', veterancy: 0, quantity: 3 },
      // REC (2 cards)
      { unitId: 'sdf_scout_walker', veterancy: 0, quantity: 3 },
      { unitId: 'sdf_scout_walker', veterancy: 0, quantity: 3 },
      // AA (3 cards)
      { unitId: 'sdf_skysweeper', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_skysweeper', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_skysweeper', veterancy: 0, quantity: 4 },
      // ART (3 cards)
      { unitId: 'sdf_field_gun_bombast', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_field_gun_bombast', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_tremor_cannon', veterancy: 0, quantity: 3 },
      // HEL (2 cards)
      { unitId: 'sdf_falcon_gunship_rotary', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_falcon_gunship_rotary', veterancy: 0, quantity: 2 },
      // AIR (2 cards)
      { unitId: 'sdf_nova_fighter_asf', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_nova_fighter_asf', veterancy: 0, quantity: 2 },
    ],
    activationPoints: 49,
  },

  // SDF 212th Heavy Armor - Tank-heavy force
  // LOG(3)=4 + INF(5)=11 + TNK(9)=14 + REC(2)=3 + AA(3)=5 + ART(2)=3 + HEL(2)=5 + AIR(2)=5 = 50 AP, 28 cards
  {
    id: 'starter_sdf_212th_heavy_armor',
    name: '212th Heavy Armor Starter',
    divisionId: 'sdf_212th_heavy_armor',
    units: [
      // LOG (3 cards)
      { unitId: 'sdf_armored_transport', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_armored_transport', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_armored_transport', veterancy: 0, quantity: 12 },
      // INF (5 cards)
      { unitId: 'sdf_trooper', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_trooper_mech', veterancy: 0, quantity: 8 },
      { unitId: 'sdf_stormtrooper', veterancy: 0, quantity: 6 },
      { unitId: 'sdf_militia', veterancy: 0, quantity: 16 },
      { unitId: 'sdf_centurion_apc', veterancy: 0, quantity: 8 },
      // TNK (9 cards)
      { unitId: 'sdf_bastion_mbt', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_bastion_mbt', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_bastion_mbt', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_bastion_mbt_rotary', veterancy: 0, quantity: 6 },
      { unitId: 'sdf_bastion_mbt_rotary', veterancy: 0, quantity: 6 },
      { unitId: 'sdf_bastion_mbt_siege', veterancy: 0, quantity: 6 },
      { unitId: 'sdf_bastion_mbt_siege', veterancy: 0, quantity: 6 },
      { unitId: 'sdf_bastion_mbt_hunter', veterancy: 0, quantity: 3 },
      { unitId: 'sdf_behemoth', veterancy: 0, quantity: 3 },
      // REC (2 cards)
      { unitId: 'sdf_scout_walker', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_scout_walker', veterancy: 0, quantity: 4 },
      // AA (3 cards)
      { unitId: 'sdf_skysweeper', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_skysweeper', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_skysweeper', veterancy: 0, quantity: 12 },
      // ART (2 cards)
      { unitId: 'sdf_tremor_cannon', veterancy: 0, quantity: 3 },
      { unitId: 'sdf_barrage_launcher', veterancy: 0, quantity: 4 },
      // HEL (2 cards)
      { unitId: 'sdf_falcon_gunship_at', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_falcon_gunship_rotary', veterancy: 0, quantity: 2 },
      // AIR (2 cards)
      { unitId: 'sdf_nova_fighter_strike', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_nova_fighter_asf', veterancy: 0, quantity: 2 },
    ],
    activationPoints: 50,
  },

  // SDF 45th Siege - Artillery focus (no HEL/AIR units in roster)
  // LOG(2)=2 + INF(6)=10 + TNK(3)=9 + REC(4)=7 + AA(2)=2 + ART(9)=16 = 46 AP, 26 cards
  {
    id: 'starter_sdf_45th_siege',
    name: '45th Siege Starter',
    divisionId: 'sdf_45th_siege',
    units: [
      // LOG (2 cards)
      { unitId: 'sdf_transport_truck', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_command_squad', veterancy: 0, quantity: 4 },
      // INF (6 cards)
      { unitId: 'sdf_trooper', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_trooper', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_militia', veterancy: 0, quantity: 18 },
      { unitId: 'sdf_hwt_heavy_bolter', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_hwt_missile', veterancy: 0, quantity: 6 },
      { unitId: 'sdf_rocket_team', veterancy: 0, quantity: 6 },
      // TNK (3 cards)
      { unitId: 'sdf_bastion_mbt', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_bastion_mbt_siege', veterancy: 0, quantity: 6 },
      { unitId: 'sdf_behemoth', veterancy: 0, quantity: 2 },
      // REC (4 cards)
      { unitId: 'sdf_scout_walker', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_scout_walker', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_sniper_team', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_sniper_team', veterancy: 0, quantity: 4 },
      // AA (2 cards)
      { unitId: 'sdf_skysweeper', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_skysweeper', veterancy: 0, quantity: 12 },
      // ART (9 cards)
      { unitId: 'sdf_tremor_cannon', veterancy: 0, quantity: 3 },
      { unitId: 'sdf_tremor_cannon', veterancy: 0, quantity: 3 },
      { unitId: 'sdf_tremor_cannon', veterancy: 0, quantity: 3 },
      { unitId: 'sdf_tremor_cannon', veterancy: 0, quantity: 3 },
      { unitId: 'sdf_barrage_launcher', veterancy: 0, quantity: 3 },
      { unitId: 'sdf_barrage_launcher', veterancy: 0, quantity: 3 },
      { unitId: 'sdf_field_gun_bombast', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_field_gun_bombast', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_vortex_missile', veterancy: 0, quantity: 12 },
    ],
    activationPoints: 46,
  },

  // SDF 101st Airborne - Air assault focus
  // LOG(3)=5 + INF(7)=9 + TNK(1)=3 + REC(3)=4 + AA(1)=1 + ART(2)=5 + HEL(7)=10 + AIR(8)=13 = 50 AP, 32 cards
  {
    id: 'starter_sdf_101st_airborne',
    name: '101st Airborne Starter',
    divisionId: 'sdf_101st_airborne',
    units: [
      // LOG (3 cards)
      { unitId: 'sdf_scout_carrier', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_scout_carrier', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_command_squad', veterancy: 0, quantity: 4 },
      // INF (7 cards)
      { unitId: 'sdf_stormtrooper', veterancy: 0, quantity: 8 },
      { unitId: 'sdf_stormtrooper', veterancy: 0, quantity: 8 },
      { unitId: 'sdf_stormtrooper_airborne', veterancy: 0, quantity: 6 },
      { unitId: 'sdf_trooper_airborne', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_rocket_team', veterancy: 0, quantity: 12 },
      { unitId: 'sdf_hwt_heavy_bolter', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_engineer', veterancy: 0, quantity: 6 },
      // TNK (1 card)
      { unitId: 'sdf_bastion_mbt', veterancy: 0, quantity: 12 },
      // REC (3 cards)
      { unitId: 'sdf_scout_walker', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_scout_walker', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_sniper_team', veterancy: 0, quantity: 2 },
      // AA (1 card)
      { unitId: 'sdf_skysweeper', veterancy: 0, quantity: 12 },
      // ART (2 cards)
      { unitId: 'sdf_vortex_missile', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_barrage_launcher', veterancy: 0, quantity: 2 },
      // HEL (7 cards)
      { unitId: 'sdf_falcon_gunship_rotary', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_falcon_gunship_rotary', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_falcon_gunship_rotary', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_falcon_gunship_at', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_falcon_gunship_at', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_grav_lander', veterancy: 0, quantity: 4 },
      { unitId: 'sdf_grav_lander', veterancy: 0, quantity: 4 },
      // AIR (8 cards)
      { unitId: 'sdf_nova_fighter_interceptor', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_nova_fighter_interceptor', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_nova_fighter_strike', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_nova_fighter_strike', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_nova_fighter_asf', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_nova_fighter_asf', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_nova_fighter_bomber', veterancy: 0, quantity: 2 },
      { unitId: 'sdf_nova_fighter_bomber', veterancy: 0, quantity: 2 },
    ],
    activationPoints: 50,
  },

  // ============ Vanguard Starter Decks ============

  // Vanguard 1st Veteran - Elite exo-armor focus
  // LOG(2)=3 + INF(7)=13 + TNK(5)=9 + REC(2)=5 + AA(1)=2 + ART(1)=3 + HEL(2)=5 + AIR(2)=5 = 45 AP, 22 cards
  // Elite division intentionally has fewer but more powerful cards
  {
    id: 'starter_vanguard_1st_veteran',
    name: '1st Veteran Starter',
    divisionId: 'vanguard_1st_veteran',
    units: [
      // LOG (2 cards)
      { unitId: 'vanguard_command_skimmer', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_supply_transport', veterancy: 0, quantity: 8 },
      // AA (1 card)
      { unitId: 'vanguard_skyguard', veterancy: 0, quantity: 6 },
      // ART (1 card)
      { unitId: 'vanguard_plasma_mortar', veterancy: 0, quantity: 6 },
      // INF (7 cards)
      { unitId: 'vanguard_infantry', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_infantry_fusion', veterancy: 0, quantity: 8 },
      { unitId: 'vanguard_infantry_ion', veterancy: 0, quantity: 8 },
      { unitId: 'vanguard_heavy_support_auto', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_heavy_support_laser', veterancy: 0, quantity: 6 },
      { unitId: 'vanguard_heavy_ifv_mk1', veterancy: 0, quantity: 8 },
      { unitId: 'vanguard_heavy_ifv_mk2', veterancy: 0, quantity: 4 },
      // TNK (5 cards)
      { unitId: 'vanguard_exo_armor_kinetic', veterancy: 0, quantity: 8 },
      { unitId: 'vanguard_exo_armor_shock', veterancy: 0, quantity: 8 },
      { unitId: 'vanguard_fortress_tank', veterancy: 0, quantity: 3 },
      { unitId: 'vanguard_iron_walker_fusion', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_iron_walker_assault', veterancy: 0, quantity: 12 },
      // REC (2 cards)
      { unitId: 'vanguard_recon', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_recon_sniper', veterancy: 0, quantity: 2 },
      // HEL (2 cards)
      { unitId: 'vanguard_raven_hunter', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_raven_dropship', veterancy: 0, quantity: 2 },
      // AIR (2 cards)
      { unitId: 'vanguard_talon_strike', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_titan_dropship', veterancy: 0, quantity: 12 },
    ],
    activationPoints: 45,
  },

  // Vanguard 2nd Battle - Balanced tactical force
  // LOG(2)=3 + INF(7)=13 + TNK(5)=9 + REC(3)=6 + AA(1)=1 + ART(2)=3 + HEL(3)=6 + AIR(3)=6 = 47 AP, 26 cards
  {
    id: 'starter_vanguard_2nd_battle',
    name: '2nd Battle Starter',
    divisionId: 'vanguard_2nd_battle',
    units: [
      // LOG (2 cards)
      { unitId: 'vanguard_command_skimmer', veterancy: 0, quantity: 6 },
      { unitId: 'vanguard_supply_transport', veterancy: 0, quantity: 12 },
      // ART (2 cards)
      { unitId: 'vanguard_plasma_mortar', veterancy: 0, quantity: 6 },
      { unitId: 'vanguard_ion_battery', veterancy: 0, quantity: 3 },
      // INF (7 cards)
      { unitId: 'vanguard_infantry', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_infantry_fusion', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_infantry_ion', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_heavy_support_auto', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_heavy_support_laser', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_jetpack_squad', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_apc_mk1', veterancy: 0, quantity: 12 },
      // TNK (5 cards)
      { unitId: 'vanguard_hunter_tank', veterancy: 0, quantity: 6 },
      { unitId: 'vanguard_hunter_tank_laser', veterancy: 0, quantity: 6 },
      { unitId: 'vanguard_iron_walker_assault', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_exo_armor_kinetic', veterancy: 0, quantity: 8 },
      { unitId: 'vanguard_fortress_tank', veterancy: 0, quantity: 4 },
      // REC (3 cards)
      { unitId: 'vanguard_recon', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_recon_bike', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_recon_sniper', veterancy: 0, quantity: 4 },
      // AA (1 card)
      { unitId: 'vanguard_swift_skimmer_missile', veterancy: 0, quantity: 12 },
      // HEL (3 cards)
      { unitId: 'vanguard_raven_hunter', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_raven_hunter', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_titan_dropship', veterancy: 0, quantity: 2 },
      // AIR (3 cards)
      { unitId: 'vanguard_talon_interceptor', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_talon_interceptor', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_star_fighter', veterancy: 0, quantity: 2 },
    ],
    activationPoints: 47,
  },

  // Vanguard 8th Assault - Fast attack focus
  // LOG(1)=1 + INF(6)=10 + TNK(4)=8 + REC(3)=6 + AA(2)=3 + ART(1)=3 + HEL(5)=9 + AIR(5)=9 = 49 AP, 27 cards
  {
    id: 'starter_vanguard_8th_assault',
    name: '8th Assault Starter',
    divisionId: 'vanguard_8th_assault',
    units: [
      // LOG (1 card)
      { unitId: 'vanguard_supply_transport', veterancy: 0, quantity: 12 },
      // ART (1 card)
      { unitId: 'vanguard_plasma_mortar', veterancy: 0, quantity: 6 },
      // INF (6 cards)
      { unitId: 'vanguard_jetpack_squad', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_jetpack_squad', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_jetpack_assault', veterancy: 0, quantity: 6 },
      { unitId: 'vanguard_infantry_fusion', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_infantry', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_heavy_support_auto', veterancy: 0, quantity: 12 },
      // TNK (4 cards)
      { unitId: 'vanguard_hunter_tank_laser', veterancy: 0, quantity: 6 },
      { unitId: 'vanguard_exo_armor_kinetic', veterancy: 0, quantity: 8 },
      { unitId: 'vanguard_exo_armor_shock', veterancy: 0, quantity: 8 },
      { unitId: 'vanguard_iron_walker_assault', veterancy: 0, quantity: 12 },
      // REC (3 cards)
      { unitId: 'vanguard_outrider', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_outrider', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_recon_bike', veterancy: 0, quantity: 4 },
      // AA (2 cards)
      { unitId: 'vanguard_swift_skimmer_missile', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_swift_skimmer_missile', veterancy: 0, quantity: 12 },
      // HEL (5 cards)
      { unitId: 'vanguard_raven_dropship', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_raven_dropship', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_raven_dropship', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_raven_hunter', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_titan_dropship', veterancy: 0, quantity: 2 },
      // AIR (5 cards)
      { unitId: 'vanguard_star_fighter', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_star_fighter', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_talon_interceptor', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_talon_interceptor', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_talon_strike', veterancy: 0, quantity: 2 },
    ],
    activationPoints: 49,
  },

  // Vanguard 10th Scout - Recon/flanking focus
  // LOG(3)=6 + INF(7)=11 + TNK(3)=9 + REC(6)=8 + AA(2)=3 + ART(1)=1 + HEL(3)=6 + AIR(3)=6 = 50 AP, 28 cards
  {
    id: 'starter_vanguard_10th_scout',
    name: '10th Scout Starter',
    divisionId: 'vanguard_10th_scout',
    units: [
      // LOG (3 cards)
      { unitId: 'vanguard_scout_skimmer', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_scout_skimmer', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_command_skimmer', veterancy: 0, quantity: 4 },
      // INF (7 cards)
      { unitId: 'vanguard_infantry', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_infantry_recon', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_infantry_fusion', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_infantry_ion', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_jetpack_squad', veterancy: 0, quantity: 6 },
      { unitId: 'vanguard_swift_skimmer_auto', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_apc_mk1', veterancy: 0, quantity: 12 },
      // TNK (3 cards)
      { unitId: 'vanguard_hunter_tank', veterancy: 0, quantity: 6 },
      { unitId: 'vanguard_hunter_tank_laser', veterancy: 0, quantity: 6 },
      { unitId: 'vanguard_exo_armor_kinetic', veterancy: 0, quantity: 4 },
      // REC (6 cards)
      { unitId: 'vanguard_recon', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_recon', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_recon_sniper', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_recon_sniper', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_outrider', veterancy: 0, quantity: 4 },
      { unitId: 'vanguard_recon_bike', veterancy: 0, quantity: 4 },
      // AA (2 cards)
      { unitId: 'vanguard_swift_skimmer_missile', veterancy: 0, quantity: 12 },
      { unitId: 'vanguard_swift_skimmer_missile', veterancy: 0, quantity: 12 },
      // ART (1 card)
      { unitId: 'vanguard_plasma_mortar', veterancy: 0, quantity: 4 },
      // HEL (3 cards)
      { unitId: 'vanguard_raven_hunter', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_raven_hunter', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_raven_dropship', veterancy: 0, quantity: 2 },
      // AIR (3 cards)
      { unitId: 'vanguard_talon_interceptor', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_talon_strike', veterancy: 0, quantity: 2 },
      { unitId: 'vanguard_star_fighter', veterancy: 0, quantity: 2 },
    ],
    activationPoints: 50,
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
