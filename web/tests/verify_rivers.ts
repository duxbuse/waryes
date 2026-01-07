
import { MapGenerator } from '../src/game/map/MapGenerator';
import { MAP_SIZES } from '../src/data/types';

async function verifyRivers() {
    console.log('Starting River Generation Verification...');

    const seeds = [123, 456, 789, 101112, 131415];
    const size = 'medium';

    for (const seed of seeds) {
        console.log(`\nTesting Seed: ${seed}`);
        const generator = new MapGenerator(seed, size);
        const map = generator.generate();

        const rivers = map.waterBodies.filter(w => w.type === 'river');
        console.log(`- Total rivers/tributaries generated: ${rivers.length}`);

        if (rivers.length > 1) {
            console.log(`- SUCCESS: Multiple river segments (forks/tributaries) generated.`);
        } else if (rivers.length === 1) {
            console.log(`- WARNING: Only 1 river segment generated. Forking might be rare for this seed.`);
        } else {
            console.log(`- NOTE: No rivers generated for this seed.`);
        }

        // Verify flatness
        let bumpyPoints = 0;
        let totalRiverCells = 0;
        for (let z = 0; z < map.terrain.length; z++) {
            for (let x = 0; x < map.terrain[z].length; x++) {
                const cell = map.terrain[z][x];
                if (cell.type === 'river') {
                    totalRiverCells++;
                    if (cell.elevation !== 0) {
                        bumpyPoints++;
                    }
                }
            }
        }

        if (totalRiverCells > 0) {
            if (bumpyPoints === 0) {
                console.log(`- SUCCESS: All ${totalRiverCells} river cells are perfectly flat (elevation 0).`);
            } else {
                console.log(`- FAILURE: Found ${bumpyPoints} bumpy river cells!`);
            }
        }
    }

    console.log('\nVerification Complete.');
}

verifyRivers().catch(console.error);
