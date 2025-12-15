import os
import json

# Configuration
UNITS_DIR = r"c:\Users\duxbu\OneDrive\Documents\code\waryes\units"
HEAVY_KEYWORDS = [
    "cannon", "missile", "rocket", "bomb", "mortar", 
    "howitzer", "fusion", "launcher", "railgun"
]

# New Ammo Counts
AMMO_HEAVY = 10
AMMO_STANDARD = 20

def is_heavy(weapon_id):
    wid = weapon_id.lower()
    for kw in HEAVY_KEYWORDS:
        if kw in wid:
            if "rotary" in wid and "missile" not in wid:
                return False 
            return True
    return False

def process_file(filepath):
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        updated = False
        if "weapons" in data:
            for weapon in data["weapons"]:
                
                wid = weapon["weapon_id"]
                current_ammo = weapon.get("max_ammo", 999) 
                
                target_ammo = AMMO_STANDARD
                if is_heavy(wid):
                    target_ammo = AMMO_HEAVY
                
                # Apply change
                if current_ammo != target_ammo:
                    weapon["max_ammo"] = target_ammo
                    updated = True
                    print(f"  - {wid}: {current_ammo} -> {target_ammo}")

        if updated:
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=4)
            print(f"Updated {os.path.basename(filepath)}")
            
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

def main():
    print("Starting Ammo Rebalance...")
    count = 0
    for root, dirs, files in os.walk(UNITS_DIR):
        for file in files:
            if file.endswith(".json"):
                print(f"Processing {file}...")
                process_file(os.path.join(root, file))
                count += 1
    print(f"Finished processing {count} files.")

if __name__ == "__main__":
    main()
