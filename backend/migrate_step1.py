import sqlite3
import os

def upgrade_db():
    db_path = 'vendor360.db'
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found. Skipping alter tables.")
        return
        
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # Safely add columns to inventory_items
    try:
        c.execute('ALTER TABLE inventory_items ADD COLUMN expiry_date DATETIME')
        print("Added expiry_date column.")
    except sqlite3.OperationalError:
        print("expiry_date column already exists.")
        
    try:
        c.execute('ALTER TABLE inventory_items ADD COLUMN barcode VARCHAR')
        print("Added barcode column.")
    except sqlite3.OperationalError:
        print("barcode column already exists.")
        
    conn.commit()
    conn.close()
    
    # Create new tables using SQLAlchemy
    from database import engine
    from models import Base
    Base.metadata.create_all(bind=engine)
    print("Migration complete! Customers and KhataTransaction tables are ready.")

if __name__ == "__main__":
    upgrade_db()
