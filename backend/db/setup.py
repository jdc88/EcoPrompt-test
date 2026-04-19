import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import connect_to_database

def run_schema():
    conn = connect_to_database()
    try:
        cur = conn.cursor()
        # Adjust path to find schema.sql relative to this file
        schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
        with open(schema_path, "r", encoding="utf-8") as f:
            cur.execute(f.read())
        conn.commit()
        print("Schema created successfully.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    run_schema()