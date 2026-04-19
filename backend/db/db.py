import psycopg2
from settings import DatabaseConfig

def connect_to_database():
    conn = psycopg2.connect(DatabaseConfig.DATABASE_URL)
    return conn

def close_database_connection(conn):
    conn.close()