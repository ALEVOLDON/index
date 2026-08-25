import subprocess
import sys
import unittest

class TestTypeScriptSuite(unittest.TestCase):
    def test_typescript_intelligence_suite(self):
        ret = subprocess.call(['npm', 'test'], shell=True)
        self.assertEqual(ret, 0, 'TypeScript unit tests failed')

if __name__ == '__main__':
    unittest.main()
