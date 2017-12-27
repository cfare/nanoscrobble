NANO_LFM_API_KEY_FILE    = "../../lastfmapi.key"
NANO_LFM_API_SECRET_FILE = "../../lastfmsecret.key"

def lastfm_api_key():
    with open(NANO_LFM_API_KEY_FILE) as f:
        return f.read().rstrip()

def lastfm_api_secret():
    with open(NANO_LFM_API_SECRET_FILE) as f:
        return f.read().rstrip()
