import subprocess
import sys

if __name__ == '__main__':
    ret = subprocess.call('npx tsx src/analysis/engine.ts', shell=True)
    sys.exit(ret)
