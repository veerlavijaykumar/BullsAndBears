#!/usr/bin/env python3
"""Test the Dictionary API implementation"""

import requests
import json

def test_free_dictionary_api(word):
    """Test the Free Dictionary API directly"""
    print(f"\n{'='*60}")
    print(f"Testing word: {word.upper()}")
    print(f"{'='*60}")
    
    api_url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
    
    try:
        response = requests.get(api_url, timeout=5)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if data and len(data) > 0:
                entry = data[0]
                print(f"\n✅ Word found: {entry.get('word', word).upper()}")
                
                # Extract all definitions and parts of speech
                all_definitions = []
                parts_of_speech = []
                meaning_parts = []
                
                if 'meanings' in entry:
                    for meaning in entry['meanings']:
                        pos = meaning.get('partOfSpeech', 'Unknown')
                        if pos not in parts_of_speech:
                            parts_of_speech.append(pos)
                        
                        definitions = meaning.get('definitions', [])
                        if definitions and len(definitions) > 0:
                            # Add first definition for primary meaning
                            first_def = definitions[0].get('definition', '')
                            if first_def and len(meaning_parts) < 2:
                                meaning_parts.append(f"{pos.capitalize()}: {first_def}")
                            
                            # Add all definitions to list
                            for idx, defn in enumerate(definitions[:3]):
                                definition_text = defn.get('definition', '')
                                if definition_text:
                                    all_definitions.append(f"({pos.capitalize()}) {definition_text}")
                
                primary_meaning = meaning_parts[0] if meaning_parts else "Definition found"
                
                print(f"\nParts of Speech: {', '.join(parts_of_speech)}")
                print(f"\nPrimary Meaning:")
                print(f"  {primary_meaning}")
                print(f"\nAll Definitions ({len(all_definitions)}):")
                for i, defn in enumerate(all_definitions[:4], 1):
                    print(f"  {i}. {defn}")
                
                return True
        else:
            print(f"❌ API returned status {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    # Test with various words
    test_words = ["quest", "addle", "crane", "house", "swift"]
    
    success_count = 0
    for word in test_words:
        if test_free_dictionary_api(word):
            success_count += 1
    
    print(f"\n{'='*60}")
    print(f"Results: {success_count}/{len(test_words)} words successfully fetched")
    print(f"{'='*60}\n")
