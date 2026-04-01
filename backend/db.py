from pymongo import MongoClient

from config import MONGO_DB_NAME, MONGO_URI

_client = None
_db = None


def get_db():
    global _client, _db

    if _db is None:
        _client = MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
        )
        _db = _client[MONGO_DB_NAME]

    return _db


class LazyCollection:
    def __init__(self, collection_name):
        self.collection_name = collection_name

    def _collection(self):
        return get_db()[self.collection_name]

    def __getattr__(self, name):
        return getattr(self._collection(), name)


bags_collection = LazyCollection("bags")
employees_collection = LazyCollection("employees")
