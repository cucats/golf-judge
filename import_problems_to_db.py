#!/usr/bin/env python3
"""
Import migrated problems from files into the database.
Reads from problems/{id}/ and inserts into PostgreSQL.
"""

import os
import sys
from pathlib import Path
import psycopg2
from datetime import datetime

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/codegolf")

PROBLEMS_DIR = Path("problems")

def read_problem_files(problem_id):
    """Read problem files and return data for database insertion."""
    problem_dir = PROBLEMS_DIR / str(problem_id)

    # Read statement
    statement_path = problem_dir / "statement.md"
    with open(statement_path, 'r') as f:
        statement = f.read()

    # Extract title from first line of statement (e.g., "# Matrix Rotation")
    first_line = statement.split('\n')[0]
    title = first_line.replace('#', '').strip()

    # Read test inputs and outputs (entire files as-is)
    input_path = problem_dir / "input.txt"
    output_path = problem_dir / "output.txt"

    with open(input_path, 'r') as f:
        test_input = f.read()

    with open(output_path, 'r') as f:
        test_output = f.read()

    # Count tests from first line
    test_count = int(test_input.split('\n')[0])

    return {
        'id': problem_id,
        'title': title,
        'statement': statement,
        'test_input': test_input,
        'test_output': test_output,
        'test_count': test_count
    }

def import_problem(conn, problem_data):
    """Import a single problem into the database."""
    cur = conn.cursor()

    problem_id = problem_data['id']
    title = problem_data['title']
    statement = problem_data['statement']
    test_input = problem_data['test_input']
    test_output = problem_data['test_output']

    # Default limits (2s CPU, 256MB RAM)
    time_limit = 2.0
    memory_limit = 256000
    created_at = int(datetime.now().timestamp())

    print(f"\nImporting Problem {problem_id}: {title}")
    print(f"  {problem_data['test_count']} test cases")

    # Insert problem (or update if exists)
    cur.execute("""
        INSERT INTO problems (id, title, statement, test_input, test_output, time_limit_secs, memory_limit_kb, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            statement = EXCLUDED.statement,
            test_input = EXCLUDED.test_input,
            test_output = EXCLUDED.test_output,
            time_limit_secs = EXCLUDED.time_limit_secs,
            memory_limit_kb = EXCLUDED.memory_limit_kb
    """, (problem_id, title, statement, test_input, test_output, time_limit, memory_limit, created_at))

    print(f"  ✓ Inserted problem with test data")

    conn.commit()
    cur.close()

def main():
    """Import all problems from files into database."""
    print("Importing problems into database...")
    print(f"Database: {DATABASE_URL}")
    print(f"Problems directory: {PROBLEMS_DIR}")

    # Find all problem directories
    problem_dirs = sorted([d for d in PROBLEMS_DIR.iterdir() if d.is_dir() and d.name.isdigit()])
    problem_ids = [int(d.name) for d in problem_dirs]

    print(f"\nFound {len(problem_ids)} problems: {problem_ids}")

    # Connect to database
    try:
        conn = psycopg2.connect(DATABASE_URL)
        print("✓ Connected to database")
    except Exception as e:
        print(f"✗ Failed to connect to database: {e}")
        sys.exit(1)

    # Import each problem
    for problem_id in problem_ids:
        try:
            problem_data = read_problem_files(problem_id)
            import_problem(conn, problem_data)
        except Exception as e:
            print(f"  ✗ Error importing problem {problem_id}: {e}")
            import traceback
            traceback.print_exc()
            conn.rollback()

    conn.close()

    print("\n" + "="*60)
    print("Import complete!")
    print("\nNext steps:")
    print("1. Start the server: cargo run")
    print("2. Create a contest and add these problems")
    print("3. Test submissions")

if __name__ == "__main__":
    main()
