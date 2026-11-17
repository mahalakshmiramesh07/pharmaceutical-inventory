import mysql.connector

def get_db():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="root123",   # if you have password, type it here
        database="inventory_db"
    )