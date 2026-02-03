class HackathonDbRouter:
    CORE_MODEL_NAMES = {
        'appuser',
        'appusermember',
        'authsession',
        'otpchallenge',
    }
    
    # Models that use the student database (team25)
    STUDENT_MODEL_NAMES = {
        'vocabword',  # vocab_words table (existing)
        'gameresult',  # gameresults table (existing)
    }

    def db_for_read(self, model, **hints):
        if getattr(model._meta, 'app_label', None) != 'hackathon':
            return None

        model_name = getattr(model._meta, 'model_name', '').lower()
        if model_name in self.CORE_MODEL_NAMES:
            return 'default'
        if model_name in self.STUDENT_MODEL_NAMES:
            return 'student'
        return 'student'

    def db_for_write(self, model, **hints):
        if getattr(model._meta, 'app_label', None) != 'hackathon':
            return None

        model_name = getattr(model._meta, 'model_name', '').lower()
        if model_name in self.CORE_MODEL_NAMES:
            return 'default'
        if model_name in self.STUDENT_MODEL_NAMES:
            return 'student'
        return 'student'

    def allow_relation(self, obj1, obj2, **hints):
        if getattr(obj1._meta, 'app_label', None) != 'hackathon' or getattr(obj2._meta, 'app_label', None) != 'hackathon':
            return None

        name1 = getattr(obj1._meta, 'model_name', '').lower()
        name2 = getattr(obj2._meta, 'model_name', '').lower()

        is_core_1 = name1 in self.CORE_MODEL_NAMES
        is_core_2 = name2 in self.CORE_MODEL_NAMES

        if is_core_1 != is_core_2:
            return False

        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label != 'hackathon':
            return None

        model = hints.get('model')
        if model is not None:
            target_db = self.db_for_write(model)
            return target_db == db

        if model_name is None:
            return None

        if str(model_name).lower() in self.CORE_MODEL_NAMES:
            return db == 'default'
        return db == 'student'
