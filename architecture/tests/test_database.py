# tests/test_database.py
import unittest
from backend.models.user import User
from backend.models.note import Note

class TestDatabase(unittest.TestCase):
    def test_model_relationships(self):
        """Demonstrates checking SQLAlchemy model concepts"""
        u = User(email="test@test.com", password_hash="hash")
        n = Note(title="Test", encrypted_content=b"123", nonce=b"1", salt=b"2")
        
        u.notes.append(n)
        
        self.assertEqual(len(u.notes), 1)
        self.assertEqual(u.notes[0].title, "Test")

if __name__ == '__main__':
    unittest.main()
