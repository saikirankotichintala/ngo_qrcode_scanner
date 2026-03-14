from pymongo import MongoClient

from config import MONGO_DB_NAME, MONGO_URI

client = MongoClient(MONGO_URI)
db = client[MONGO_DB_NAME]
bags_collection = db["bags"]
employees_collection = db["employees"]
