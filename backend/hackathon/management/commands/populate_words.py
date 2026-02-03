from django.core.management.base import BaseCommand
from hackathon.models import Word


class Command(BaseCommand):
    help = 'Populate the Word table with 5-letter words for Bulls and Bears game'

    def handle(self, *args, **options):
        # List of 5-letter words - answers (more common words)
        answer_words = [
            'ABOUT', 'ABOVE', 'ABUSE', 'ACTOR', 'ACUTE', 'ADMIT', 'ADOPT', 'ADULT', 'AFTER',
            'AGAIN', 'AGENT', 'AGREE', 'AHEAD', 'ALARM', 'ALBUM', 'ALERT', 'ALIEN', 'ALIGN',
            'ALIKE', 'ALIVE', 'ALLOW', 'ALONE', 'ALONG', 'ALTER', 'AMBER', 'AMEND', 'ANGEL',
            'ANGER', 'ANGLE', 'ANGRY', 'APART', 'APPLE', 'APPLY', 'ARENA', 'ARGUE', 'ARISE',
            'ARRAY', 'ARROW', 'ASIDE', 'ASSET', 'AUDIO', 'AUDIT', 'AVOID', 'AWARD', 'AWARE',
            'BADLY', 'BAKER', 'BASES', 'BASIC', 'BASIS', 'BEACH', 'BEGAN', 'BEGIN', 'BEING',
            'BELLY', 'BELOW', 'BENCH', 'BILLY', 'BIRTH', 'BLACK', 'BLADE', 'BLAME', 'BLANK',
            'BLAST', 'BLEED', 'BLIND', 'BLOCK', 'BLOOD', 'BLOOM', 'BLUES', 'BOARD', 'BOOST',
            'BOOTH', 'BOUND', 'BRAIN', 'BRAND', 'BREAD', 'BREAK', 'BREED', 'BRIEF', 'BRING',
            'BROAD', 'BROKE', 'BROWN', 'BUILD', 'BUILT', 'BUYER', 'CABLE', 'CALIF', 'CARRY',
            'CATCH', 'CAUSE', 'CHAIN', 'CHAIR', 'CHAOS', 'CHARM', 'CHART', 'CHASE', 'CHEAP',
            'CHECK', 'CHEST', 'CHIEF', 'CHILD', 'CHINA', 'CHOSE', 'CIVIC', 'CIVIL', 'CLAIM',
            'CLASS', 'CLEAN', 'CLEAR', 'CLICK', 'CLOCK', 'CLOSE', 'COACH', 'COAST', 'COULD',
            'COUNT', 'COURT', 'COVER', 'CRAFT', 'CRASH', 'CREAM', 'CRIME', 'CROSS', 'CROWD',
            'CROWN', 'CRUDE', 'CURVE', 'CYCLE', 'DAILY', 'DANCE', 'DATED', 'DEALT', 'DEATH',
            'DEBUT', 'DELAY', 'DEPTH', 'DOING', 'DOUBT', 'DOZEN', 'DRAFT', 'DRAMA', 'DRAWN',
            'DREAM', 'DRESS', 'DRILL', 'DRINK', 'DRIVE', 'DROVE', 'DYING', 'EAGER', 'EARLY',
            'EARTH', 'EIGHT', 'ELITE', 'EMPTY', 'ENEMY', 'ENJOY', 'ENTER', 'ENTRY', 'EQUAL',
            'ERROR', 'EVENT', 'EVERY', 'EXACT', 'EXIST', 'EXTRA', 'FAITH', 'FALSE', 'FAULT',
            'FIBER', 'FIELD', 'FIFTH', 'FIFTY', 'FIGHT', 'FINAL', 'FIRST', 'FIXED', 'FLASH',
            'FLEET', 'FLOOR', 'FLUID', 'FOCUS', 'FORCE', 'FORTH', 'FORTY', 'FORUM', 'FOUND',
            'FRAME', 'FRANK', 'FRAUD', 'FRESH', 'FRONT', 'FRUIT', 'FULLY', 'FUNNY', 'GIANT',
            'GIVEN', 'GLASS', 'GLOBE', 'GOING', 'GRACE', 'GRADE', 'GRAND', 'GRANT', 'GRASS',
            'GREAT', 'GREEN', 'GROSS', 'GROUP', 'GROWN', 'GUARD', 'GUESS', 'GUEST', 'GUIDE',
            'HAPPY', 'HARRY', 'HEART', 'HEAVY', 'HENCE', 'HENRY', 'HORSE', 'HOTEL', 'HOUSE',
            'HUMAN', 'IDEAL', 'IMAGE', 'INDEX', 'INNER', 'INPUT', 'ISSUE', 'JAPAN', 'JIMMY',
            'JOINT', 'JONES', 'JUDGE', 'KNOWN', 'LABEL', 'LARGE', 'LASER', 'LATER', 'LAUGH',
            'LAYER', 'LEARN', 'LEASE', 'LEAST', 'LEAVE', 'LEGAL', 'LEMON', 'LEVEL', 'LEWIS',
            'LIGHT', 'LIMIT', 'LINKS', 'LIVES', 'LOCAL', 'LOGIC', 'LOOSE', 'LOWER', 'LUCKY',
            'LUNCH', 'LYING', 'MAGIC', 'MAJOR', 'MAKER', 'MARCH', 'MARIA', 'MATCH', 'MAYBE',
            'MAYOR', 'MEANT', 'MEDIA', 'METAL', 'MIGHT', 'MINOR', 'MINUS', 'MIXED', 'MODEL',
            'MONEY', 'MONTH', 'MORAL', 'MOTOR', 'MOUNT', 'MOUSE', 'MOUTH', 'MOVIE', 'MUSIC',
            'NEEDS', 'NEVER', 'NEWLY', 'NIGHT', 'NOISE', 'NORTH', 'NOTED', 'NOVEL', 'NURSE',
            'OCCUR', 'OCEAN', 'OFFER', 'OFTEN', 'ORDER', 'OTHER', 'OUGHT', 'PAINT', 'PANEL',
            'PAPER', 'PARTY', 'PEACE', 'PETER', 'PHASE', 'PHONE', 'PHOTO', 'PIECE', 'PILOT',
            'PITCH', 'PLACE', 'PLAIN', 'PLANE', 'PLANT', 'PLATE', 'POINT', 'POUND', 'POWER',
            'PRESS', 'PRICE', 'PRIDE', 'PRIME', 'PRINT', 'PRIOR', 'PRIZE', 'PROOF', 'PROUD',
            'PROVE', 'QUEEN', 'QUICK', 'QUIET', 'QUITE', 'RADIO', 'RAISE', 'RANGE', 'RAPID',
            'RATIO', 'REACH', 'READY', 'REFER', 'RIGHT', 'RIVAL', 'RIVER', 'ROBIN', 'ROCKY',
            'ROMAN', 'ROUGH', 'ROUND', 'ROUTE', 'ROYAL', 'RURAL', 'SCALE', 'SCENE', 'SCOPE',
            'SCORE', 'SENSE', 'SERVE', 'SEVEN', 'SHALL', 'SHAPE', 'SHARE', 'SHARP', 'SHEET',
            'SHELF', 'SHELL', 'SHIFT', 'SHINE', 'SHIRT', 'SHOCK', 'SHOOT', 'SHORT', 'SHOWN',
            'SIGHT', 'SINCE', 'SIXTH', 'SIXTY', 'SIZED', 'SKILL', 'SLEEP', 'SLIDE', 'SMALL',
            'SMART', 'SMILE', 'SMITH', 'SMOKE', 'SOLID', 'SOLVE', 'SORRY', 'SOUND', 'SOUTH',
            'SPACE', 'SPARE', 'SPEAK', 'SPEED', 'SPEND', 'SPENT', 'SPLIT', 'SPOKE', 'SPORT',
            'STAFF', 'STAGE', 'STAKE', 'STAND', 'START', 'STATE', 'STEAM', 'STEEL', 'STICK',
            'STILL', 'STOCK', 'STONE', 'STOOD', 'STORE', 'STORM', 'STORY', 'STRIP', 'STUCK',
            'STUDY', 'STUFF', 'STYLE', 'SUGAR', 'SUITE', 'SUPER', 'SWEET', 'TABLE', 'TAKEN',
            'TASTE', 'TAXES', 'TEACH', 'TERRY', 'TEXAS', 'THANK', 'THEFT', 'THEIR', 'THEME',
            'THERE', 'THESE', 'THICK', 'THING', 'THINK', 'THIRD', 'THOSE', 'THREE', 'THREW',
            'THROW', 'TIGHT', 'TIMES', 'TITLE', 'TODAY', 'TOPIC', 'TOTAL', 'TOUCH', 'TOUGH',
            'TOWER', 'TRACK', 'TRADE', 'TRAIN', 'TREAT', 'TREND', 'TRIAL', 'TRIBE', 'TRICK',
            'TRIED', 'TRIES', 'TROOP', 'TRUCK', 'TRULY', 'TRUMP', 'TRUST', 'TRUTH', 'TWICE',
            'UNCLE', 'UNDER', 'UNDUE', 'UNION', 'UNITY', 'UNTIL', 'UPPER', 'UPSET', 'URBAN',
            'USAGE', 'USUAL', 'VALID', 'VALUE', 'VIDEO', 'VIRUS', 'VISIT', 'VITAL', 'VOCAL',
            'VOICE', 'WASTE', 'WATCH', 'WATER', 'WHEEL', 'WHERE', 'WHICH', 'WHILE', 'WHITE',
            'WHOLE', 'WHOSE', 'WOMAN', 'WOMEN', 'WORLD', 'WORRY', 'WORSE', 'WORST', 'WORTH',
            'WOULD', 'WOUND', 'WRITE', 'WRONG', 'WROTE', 'YIELD', 'YOUNG', 'YOURS', 'YOUTH'
        ]

        # Additional valid guess words (can be guessed but won't be answers)
        guess_words = [
            'AAHED', 'AALII', 'AARGH', 'ABACA', 'ABACI', 'ABACK', 'ABAFT', 'ABAKA', 'ABAMP',
            'ABASE', 'ABASH', 'ABATE', 'ABAYA', 'ABBAS', 'ABBED', 'ABBES', 'ABBEY', 'ABBOT',
            'ABEAM', 'ABELE', 'ABETS', 'ABHOR', 'ABIDE', 'ABLED', 'ABLER', 'ABLES', 'ABMHO',
            'ABODE', 'ABOHM', 'ABOIL', 'ABOMA', 'ABOON', 'ABORT', 'ABRIS', 'ABYSM', 'ABYSS',
            'ACACIA', 'ACAIS', 'ACARI', 'ACCOY', 'ACERB', 'ACETA', 'ACHED', 'ACHES', 'ACHOO',
            'ACIDS', 'ACIDY', 'ACING', 'ACINI', 'ACKEE', 'ACMES', 'ACMIC', 'ACNED', 'ACNES',
            'ACOCK', 'ACOLD', 'ACORN', 'ACRED', 'ACRES', 'ACRID', 'ACTED', 'ACTIN', 'ACTON',
            'ARSON', 'ARTSY', 'ASANA', 'ASHEN', 'ASHES', 'ASIAN', 'ASKED', 'ASKER', 'ASKEW',
            'ASPEN', 'ASPER', 'ASPIC', 'ASSAI', 'ASSAM', 'ASSAY', 'ASSES', 'ASTER', 'ASTIR',
            'ATLAS', 'ATMAN', 'ATOLL', 'ATOMS', 'ATOMY', 'ATONE', 'ATONY', 'ATOPY', 'ATTIC',
            'AUNTS', 'AUNTY', 'AURAE', 'AURAL', 'AURAR', 'AURAS', 'AUREI', 'AURES', 'AURIC',
            'AURIS', 'AURUM', 'AUTOS', 'AUXIN', 'AVAIL', 'AVANT', 'AVAST', 'AVENS', 'AVERS',
            'AVERT', 'AVIAN', 'AVION', 'AVISO', 'AVOID', 'AVOWS', 'AWAIT', 'AWAKE', 'AWASH',
            'BEACH', 'BEADS', 'BEADY', 'BEAKS', 'BEAKY', 'BEAMS', 'BEAMY', 'BEANS', 'BEARD',
            'BEARS', 'BEAST', 'BEATS', 'BEAUS', 'BEAUT', 'BEAUX', 'BEBOP', 'BECAP', 'BECKS',
            'BEDEW', 'BEDIM', 'BEECH', 'BEEFS', 'BEEFY', 'BEEPS', 'BEERS', 'BEERY', 'BEETS',
            'BEFIT', 'BEFOG', 'BEGAN', 'BEGAT', 'BEGEM', 'BEGET', 'BEGOT', 'BEGUM', 'BEGUN',
            'BEIGE', 'BEIGY', 'BEING', 'BELAY', 'BELCH', 'BELGA', 'BELIE', 'BELLE', 'BELLS',
        ]

        created_answers = 0
        created_guesses = 0
        
        # Create answer words
        for word in answer_words:
            _, created = Word.objects.get_or_create(
                word=word.upper(),
                defaults={
                    'is_valid_guess': True,
                    'is_answer': True,
                    'difficulty_level': 1
                }
            )
            if created:
                created_answers += 1

        # Create guess-only words
        for word in guess_words:
            _, created = Word.objects.get_or_create(
                word=word.upper(),
                defaults={
                    'is_valid_guess': True,
                    'is_answer': False,
                    'difficulty_level': 1
                }
            )
            if created:
                created_guesses += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully created {created_answers} answer words and {created_guesses} guess words'
            )
        )
        self.stdout.write(
            self.style.SUCCESS(
                f'Total words in database: {Word.objects.count()}'
            )
        )
