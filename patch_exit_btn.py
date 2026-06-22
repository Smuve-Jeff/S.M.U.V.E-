import sys

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    old_style = """.exit-pluto-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 30px;
  font-weight: 800;
  font-size: 0.8rem;
  letter-spacing: 1px;
  color: white;
  border: 1px solid rgba(255,255,255,0.2);
  opacity: 0.3;
  transition: all 0.3s ease;
}"""

    new_style = """.exit-pluto-btn {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 20000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 30px;
  font-weight: 800;
  font-size: 0.8rem;
  letter-spacing: 1px;
  color: white;
  border: 1px solid rgba(255,255,255,0.2);
  opacity: 0.5;
  transition: all 0.3s ease;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(10px);
}"""

    if old_style in content:
        content = content.replace(old_style, new_style)
    else:
        # Fallback if white space differs
        import re
        content = re.sub(r'\.exit-pluto-btn\s*\{[^}]*\}', new_style, content)

    with open(filepath, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    patch_file(sys.argv[1])
