import re

with open(r'c:\KSA 2.0\KSA-2.0\static\js\analytics_dashboard.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace template literals with empty string to avoid false braces inside them
text = re.sub(r'`[^`]*`', '', text)

lines = text.split('\n')
brace_count = 0
last_func = "global"

for i, line in enumerate(lines):
    # remove single line comments
    line = line.split('//')[0]
    
    if "function " in line:
        last_func = line.strip()
    
    c = line.count('{') - line.count('}')
    brace_count += c
    
    if brace_count < 0:
        print(f"Error at line {i+1}: Negative brace count in {last_func}")
        break

print(f"Final brace count: {brace_count}")

# Print brace count at each function start
bc = 0
for i, line in enumerate(lines):
    line = line.split('//')[0]
    if "function " in line:
        print(f"L{i+1}: {line.strip()} (bc before: {bc})")
    bc += line.count('{') - line.count('}')
