import json
import os
import re

def clean_students(file_path='students.json'):
    """
    Identifies and removes entries from students.json that do not contain Cyrillic characters or are empty.
    """
    if not os.path.exists(file_path):
        print(f"ERROR: File '{file_path}' not found in the current directory.")
        return

    print(f"LOADING: Reading '{file_path}'...")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"ERROR: Failed to read or parse JSON: {e}")
        return

    initial_count = len(data)
    print(f"SCANNING: Testing {initial_count} records for garbage...")
    
    # Regex for Cyrillic: includes Russian (а-я) and Kyrgyz-specific characters (ң, ө, ү)
    cyrillic_pattern = re.compile(r'[а-яА-ЯёЁңҢөӨүҮ]')
    
    garbage_candidates = []
    
    for login, name in data.items():
        # A record is considered garbage if:
        # 1. The name is empty or just whitespace.
        # 2. OR the name contains NO Cyrillic characters (this catches '[EMPTY]', server errors, etc.)
        if not name or not name.strip() or not cyrillic_pattern.search(name):
            garbage_candidates.append((login, name))

    if not garbage_candidates:
        print("\nRESULT: No garbage values found. Database is clean!")
        return

    print("\n" + "="*70)
    print(f"CANDIDATES FOR DELETION ({len(garbage_candidates)} entries found):")
    print("="*70)
    
    for login, name in garbage_candidates:
        display_name = name if name.strip() else "[EMPTY STRING]"
        print(f"LOGIN: {login: <10} | VALUE: {display_name}")
    
    print("="*70)
    print(f"\nSummary: Found {len(garbage_candidates)} garbage records out of {initial_count} total.")
    
    # Interactive confirmation
    try:
        user_input = input("\nProceed with deletion and overwrite the file? (type 'yes' to confirm): ")
    except EOFError:
        print("\nNo input received. Operation cancelled.")
        return

    if user_input.lower().strip() == 'yes':
        print("\nCLEANING: Removing entries...")
        for login, _ in garbage_candidates:
            if login in data:
                del data[login]
        
        # Save the cleaned dictionary back to the file
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"SUCCESS: File '{file_path}' has been updated.")
            print(f"New total records: {len(data)} (Deleted: {len(garbage_candidates)})")
        except Exception as e:
            print(f"ERROR: Failed to write updated file: {e}")
    else:
        print("\nABORTED: No changes were made to the file.")

if __name__ == "__main__":
    clean_students()
