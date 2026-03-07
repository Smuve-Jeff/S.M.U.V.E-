import subprocess
import os

def main():
    cmd = "./node_modules/.bin/ng" + " serve" + " --host 0.0.0.0 --disable-host-check"
    with open("npm_output.log", "w") as f:
        subprocess.Popen(cmd.split(), stdout=f, stderr=f)

if __name__ == "__main__":
    main()
