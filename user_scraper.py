import requests
import json
import os

def scrape_students(start_id, end_id, output_file='students.json'):
    """
    Scans a range of student IDs from the LMS API and saves the results to a JSON file.
    """
    base_url = "https://lms.kgma.kg/vm/api/user"
    results = {}
    
    # Try to load existing data to allow continuing a failed/stopped run
    # If starting fresh, it will just start with an empty dict.
    if os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                results = json.load(f)
            print(f"Loaded {len(results)} existing entries from {output_file}")
        except:
            pass

    counter = 0
    total_range = end_id - start_id + 1

    print(f"INITIALIZING SCAN: Range {start_id} - {end_id} ({total_range} total)")
    print("-" * 60)
    
    # Session for potential performance/reliability benefit while staying sequential
    session = requests.Session()

    try:
        for student_id in range(start_id, end_id + 1):
            counter += 1
            login = f"1-{student_id}"
            
            # If we already have this login and it has a name, we can skip it to save time
            # Comment out the next 2 lines if you want to re-scan everything every time
            # if login in results and results[login]:
            #     continue

            try:
                # Query parameters mapped from app.js fetch call
                params = {
                    'id_user': student_id,
                    'id_avn': -1,
                    'id_role': 2
                }
                
                # Sequential fetch
                response = session.get(base_url, params=params, timeout=10)
                
                if response.status_code == 200:
                    # API returns data in a "data" property as per app.js fetchJSON logic
                    resp_json = response.json()
                    data = resp_json.get('data', {})
                    
                    if data:
                        surname = data.get('surname', '') or ''
                        name = data.get('name', '') or ''
                        patronymic = data.get('patronymic', '') or ''
                        
                        # Full initials as a monolithic string
                        full_name = f"{surname.strip()} {name.strip()} {patronymic.strip()}".strip()
                        
                        # Store in dictionary
                        results[login] = full_name
                        
                        # Console output as requested
                        print(f"[{counter}/{total_range}] LOGIN: {login} | RETURNED: {full_name}")
                    else:
                        print(f"[{counter}/{total_range}] LOGIN: {login} | RETURNED: [NO DATA]")
                        results[login] = "[EMPTY]"
                else:
                    print(f"[{counter}/{total_range}] LOGIN: {login} | ERROR: HTTP {response.status_code}")
                    
            except Exception as e:
                print(f"[{counter}/{total_range}] LOGIN: {login} | SYSTEM ERROR: {str(e)}")
            
            # Save every 50 records just in case of interruption
            if counter % 50 == 0:
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)

    except KeyboardInterrupt:
        print("\nProcess interrupted by user. Saving progress...")
    finally:
        # Final save
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print("-" * 60)
        print(f"DONE. Total students in database: {len(results)}")
        print(f"File saved to: {os.path.abspath(output_file)}")

if __name__ == "__main__":
    # Range specified by the user: 54650 to 71157
    scrape_students(54650, 71157)
