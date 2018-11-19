import json
import requests
import nanoconfig
from flask import Flask, request, redirect
from hashlib import md5
app = Flask(__name__)

# Constants
LASTFM_API_URL     = "https://ws.audioscrobbler.com/2.0/"
LASTFM_API_KEY     =  nanoconfig.lastfm_api_key()
LASTFM_API_SECRET  =  nanoconfig.lastfm_api_secret()
BASE_URL           = "https://scrobble.fare.scot"
LASTFM_LOGIN_URL   = "https://www.last.fm/api/auth?api_key={0}&cb={1}/authenticate-lastfm/".format(LASTFM_API_KEY, BASE_URL)
REDIRECT_BODY      = "<html><head><script type='text/javascript'>window.location.replace(\"{0}\")</script></head></html>"
USER_AGENT = "NanoScrobblerSearchServer/0.0.1"
DEBUG_MODE = True
HEADERS = {'user-agent': USER_AGENT}

# Cache
lastfm_query_cache = {}

# Back end functions -----------------------------------------------------------

def dbg_print(msg):
    if DEBUG_MODE:
        print("[dbg]", msg)

def make_api_sig(param_dict):
    sig = ""
    for k, v in sorted(param_dict.items()):
        sig += str(k)
        sig += str(v)
    sig += LASTFM_API_SECRET
    dbg_print("API Signature: " + sig)
    return md5(sig.encode('utf8')).hexdigest()

# Front end routing ------------------------------------------------------------
# Only used for local testing, use WSGI server for production deployment.
@app.route("/")
def static_index():
    return app.send_static_file('index.html')
@app.route("/nano.css")
def static_css():
    return app.send_static_file('nano.css')
@app.route("/nano.js")
def static_js():
    return app.send_static_file('nano.js')
@app.route("/icon-back.png")
def static_iconback():
    return app.send_static_file('icon-back.png')
@app.route("/icon-tick.png")
def static_icontick():
    return app.send_static_file('icon-tick.png')
@app.route("/icon-error.png")
def static_iconerror():
    return app.send_static_file('icon-error.png')
@app.route("/icon-search.png")
def static_iconsearch():
    return app.send_static_file('icon-search.png')
# -----------------------------------------------------------------------------

@app.route("/login")
def redirect_login():
    return redirect(LASTFM_LOGIN_URL)

@app.route("/search-lastfm")
def search_lastfm():
    query = request.args.get('query')

    if query not in lastfm_query_cache:
        query_params = {}
        query_params["method"]  = "album.search"
        query_params["album"]   = query
        query_params["api_key"] = LASTFM_API_KEY
        query_params["format"]  = "json"

        response = requests.get(LASTFM_API_URL, params=query_params, headers=HEADERS)
        if response.status_code == 200:
            lastfm_query_cache[query] = response.text
            return response.text
        else:
            return "{}"
    else:
        dbg_print("Cache hit for query - " + query)
        return lastfm_query_cache[query]

    return "{}"

@app.route("/album-info-lastfm")
def album_info_lastfm():

    artist = request.args.get('artist')
    title  = request.args.get('title')

    query_params = {}
    query_params["method"]      = "album.getinfo"
    query_params["album"]       = title
    query_params["artist"]      = artist
    query_params["autocorrect"] = 1
    query_params["api_key"]     = LASTFM_API_KEY
    query_params["format"]      = "json"

    response = requests.get(LASTFM_API_URL, params=query_params, headers=HEADERS)
    if response.status_code == 200:
        return response.text
    else:
        return "{}"

@app.route("/authenticate-lastfm/")
def authenticate_lastfm():
    token = request.args.get('token')
    dbg_print("Incoming token - " + token)

    # Create session with received token:
    query_params = {}
    query_params["method"]      = "auth.getSession"
    query_params["token"]       = token
    query_params["api_key"]     = LASTFM_API_KEY
    query_params["api_sig"]     = make_api_sig(query_params)
    query_params["format"]      = "json"
    response = requests.get(LASTFM_API_URL, params=query_params, headers=HEADERS)
    if response.status_code == 200:
        dbg_print("Created session successfully: " + response.text)
        session_details = json.loads(response.text)['session']
        response_out = app.make_response(REDIRECT_BODY.format('/'))
        response_out.set_cookie('ns_lastfm_user', value=session_details['name'])
        response_out.set_cookie('ns_lastfm_skey', value=session_details['key'])
        return response_out

    else:
        dbg_print("Error creating session: " + response.text)
    return "{}"


@app.route("/do-scrobble/", methods=['POST'])
def do_scrobble():
    session_key = request.cookies.get('ns_lastfm_skey')
    # Need to be logged in to scrobble:
    if not session_key:
        return "{}"

    # Rather than having to parse a dynamic number of POST arguments, scrobble
    # data is packed in a JSON text field by the client, and then processed here.
    try:
        scrobble_data = json.loads(request.form['scrobbledata'])
    except:
        dbg_print("Scrobble parsing error: " + str(request.form))
    
    query_params = {}

    for i, track in enumerate(scrobble_data):
        query_params["artist["+str(i)+"]"]       = track['artist']
        query_params["track["+str(i)+"]"]        = track['title']
        query_params["album["+str(i)+"]"]        = track['album']
        query_params["timestamp["+str(i)+"]"]    = track['timestamp']
        if track['duration'] > 0:
            query_params["duration["+str(i)+"]"] = track['duration']


    query_params["method"]  = "track.scrobble"
    query_params["api_key"] = LASTFM_API_KEY
    query_params["sk"]      = session_key
    query_params["api_sig"] = make_api_sig(query_params)
    query_params["format"]  = "json"

    response = requests.post(LASTFM_API_URL, params=query_params, headers=HEADERS)
    if response.status_code == 200:
        dbg_print("Success scobbling: " + response.text)
        return response.text
    else:
        dbg_print("Error scrobbling: " + response.text)
        return "{}"


if __name__ == "__main__":
    app.run(ssl_context='adhoc')
