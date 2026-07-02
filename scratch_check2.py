with open(r'c:\KSA 2.0\KSA-2.0\static\js\analytics_dashboard.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

brace_count = 0
for i, line in enumerate(lines):
    # This is a naive count. We'll ignore braces inside strings by doing a simple check.
    # We will just print the block to see where brace count goes off.
    clean_line = line.split('//')[0]
    # rough removal of template strings
    import re
    clean_line = re.sub(r'`[^`]*`', '', clean_line)
    clean_line = re.sub(r'"[^"]*"', '', clean_line)
    clean_line = re.sub(r"'[^']*'", '', clean_line)
    
    c = clean_line.count('{') - clean_line.count('}')
    if c != 0:
        brace_count += c
        # print(f"L{i+1} [{brace_count}]: {line.strip()}")
        
print("Final count:", brace_count)

# Let's find where brace_count goes up and doesn't come down.
