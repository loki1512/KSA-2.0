import re

with open(r'c:\KSA 2.0\KSA-2.0\static\js\analytics_dashboard.js', 'r', encoding='utf-8') as f:
    text = f.read()

# very basic check
for char in ['{', '}', '(', ')', '[', ']', '`']:
    print(f"{char}: {text.count(char)}")

# Check template literals
ticks = text.count('`')
if ticks % 2 != 0:
    print(f"Template literals are unbalanced! count: {ticks}")
