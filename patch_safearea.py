import os
import re

files_to_patch = [
    r"c:\Users\ellio\Desktop\Sisyphus\app\index.jsx",
    r"c:\Users\ellio\Desktop\Sisyphus\app\current.jsx",
    r"c:\Users\ellio\Desktop\Sisyphus\app\history.jsx",
    r"c:\Users\ellio\Desktop\Sisyphus\app\profile.jsx",
    r"c:\Users\ellio\Desktop\Sisyphus\app\settings.jsx",
    r"c:\Users\ellio\Desktop\Sisyphus\app\workout\[session].jsx",
    r"c:\Users\ellio\Desktop\Sisyphus\app\workout\EditWorkout.jsx",
    r"c:\Users\ellio\Desktop\Sisyphus\app\template\[id].jsx",
    r"c:\Users\ellio\Desktop\Sisyphus\app\exercise\[id].jsx"
]

for filepath in files_to_patch:
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        continue
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "import { SafeAreaView } from 'react-native-safe-area-context';" not in content:
        print(f"Skipping {filepath} - import not found")
        continue

    # Replace import
    content = content.replace(
        "import { SafeAreaView } from 'react-native-safe-area-context';",
        "import { useSafeAreaInsets } from 'react-native-safe-area-context';"
    )
    
    # Add const insets = useSafeAreaInsets();
    # Find the main component function: e.g. const Home = () => { or const Settings = () => {
    component_match = re.search(r"const [A-Z]\w+ = \([^)]*\) => {", content)
    if component_match:
        idx = component_match.end()
        content = content[:idx] + "\n    const insets = useSafeAreaInsets();" + content[idx:]
    else:
        print(f"Failed to find component declaration in {filepath}")
        continue
    
    # Replace self-closing <SafeAreaView ... />
    content = re.sub(
        r"<SafeAreaView[^>]*?/>",
        r"<View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]} />",
        content
    )
    
    # Replace opening <SafeAreaView ... >
    content = re.sub(
        r"<SafeAreaView[^>]*?>",
        r"<View style={[styles.container, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>",
        content
    )
    
    # Replace closing </SafeAreaView>
    content = content.replace("</SafeAreaView>", "</View>")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Patched {filepath}")

print("All done.")
