// NanoScrobbler
// (C) Copyright 2017-2018 Callum Fare

// Global stuff
// Set urlPrefix to "" when testing locally.
var urlPrefix         = "ns"
var lastfmLookupURL   = urlPrefix + "/search-lastfm"
var lastfmAlbumURL    = urlPrefix + "/album-info-lastfm"
var lastfmScrobbleURL = urlPrefix + "/do-scrobble/"
var lastfmUserAgent   = "NanoScrobblerClient/0.01"
var searchResults = []
var selectedAlbumTracks = []
var searchInProgress = false;

function onSearchResults(results)
{
    document.getElementById('album-search-load').style.display = "none";
    searchInProgress = false;
    searchResults = []

    templateCard = document.getElementById("album-result-card-template"); 
    resultObj = JSON.parse(results).results.albummatches.album;
    resultCount = 0;
    for (result of resultObj) (function(result) 
    {
        resultCard = templateCard.cloneNode(true);
        resultCard.id = "album-result-" + resultCount;
        resultCard.style.display = "inline-block";
        templateCard.parentNode.appendChild(resultCard);

        imgElem    = resultCard.getElementsByClassName("album-result-img")[0];
        infoElem   = resultCard.getElementsByClassName("album-result-info")[0];
        titleElem  = infoElem.getElementsByClassName("album-result-title")[0];
        artistElem = infoElem.getElementsByClassName("album-result-artist")[0];

        titleElem.innerHTML = result.name;
        artistElem.innerHTML = result.artist;
        imgElem.style.backgroundImage = "url('" + result.image[2]["#text"] + "')";
        resultCard.onclick = function() {onResultClick(result.artist, result.name)};
        resultCount++;
    }(result));
}

function onSearch()
{
    if (searchInProgress) return;
    document.getElementById('album-search-load').style.display = "block";
    $("#album-result-card-template").nextAll().remove();
    searchInProgress = true;

    var searchTerm = document.getElementById("searchQuery").value;

    // Send query to search backend:
    $.ajax({
      method: "GET",
      url: lastfmLookupURL,
      data: {
        query: searchTerm
      }
    })
      .done(function( msg ) {
        onSearchResults(msg)
      });

}

function onResultClick(resultArtist, resultTitle)
{
    document.getElementById('album-listing-load').style.display = "block";
    document.getElementById('search-container').style.display = "none";

    // Reset currently set album detail
    $("#album-listing-track-template").nextAll().remove();
    document.getElementById('scrobble-btn').style.display = 'inline-block';
    document.getElementById('time-setting').style.display = 'block';
    document.getElementById('scrobble-status').innerHTML = "";
    selectedAlbumTracks = [];

    // Send query to search backend:
    $.ajax({
      method: "GET",
      url: lastfmAlbumURL,
      data: { 
        artist: resultArtist,
        title:  resultTitle
      }
    })
      .done(function( msg ) {
        onAlbumInfoResult(msg)
      });
}

function onAlbumInfoResult(result)
{
    document.getElementById('album-listing-load').style.display = "none";
    document.getElementById('album-container').style.display = "block";

    resultObj = JSON.parse(result).album;
    console.log(resultObj);
    imgElem    = document.getElementById("album-listing-img");
    titleElem  = document.getElementById("album-listing-title");
    artistElem = document.getElementById("album-listing-artist");
    imgElem.style.backgroundImage = "url(" + resultObj.image[2]["#text"] + ")";
    titleElem.innerHTML = resultObj.name;
    artistElem.innerHTML = resultObj.artist;

    templateTrack = document.getElementById("album-listing-track-template"); 
    trackCount = 0;
    for (track of resultObj.tracks.track)
    {
        resultCard = templateTrack.cloneNode(true);
        resultCard.id = "album-listing-track-" + trackCount;
        resultCard.style.display = "block";
        templateTrack.parentNode.appendChild(resultCard);

        var date = new Date(null);
        date.setSeconds(track.duration);
        var dateOffset = track.duration >= 3600 ? 0 : 3;

        numElem      = resultCard.getElementsByClassName("album-listing-track-num")[0];
        titleElem    = resultCard.getElementsByClassName("album-listing-track-title")[0];
        durationElem = resultCard.getElementsByClassName("album-listing-track-duration")[0];

        numElem.innerHTML = (trackCount + 1) + ".&nbsp;";
        titleElem.innerHTML = track.name + "&nbsp;";
        durationElem.innerHTML = date.toISOString().substr(11 + dateOffset, 8 - dateOffset);

        trackCount++;

        // Selectively copy some data for the currently selected album.
        // If scrobbled, the play timestamp is also added and the data is sent
        trackObj = new Object();
        trackObj.artist = track.artist.name;
        trackObj.title = track.name;
        trackObj.album = resultObj.name;
        trackObj.duration = parseInt(track.duration);
    
        console.log(trackObj);

        selectedAlbumTracks.push(trackObj);
    }

    // If there's no track data, don't allow scrobbling
    if (trackCount == 0)
    {
        document.getElementById('scrobble-btn').style.display = 'none';
        document.getElementById('time-setting').style.display = 'none';
        document.getElementById('scrobble-status').innerHTML = 
            ":( Sorry, last.fm doesn't have track details for this album, so it<br/> can't be scrobbled. "
          + "If other results are available you can try them.";
    }
}

function onScrobbleClick()
{
    if (document.getElementById('timeChoiceCustom').checked)
    {
        var ts = (+ new Date(document.getElementById('time-selector-input').value)) / 1000;
    }
    else
    {
        var ts = (+ new Date()) / 1000;
    }

    for (track of selectedAlbumTracks.reverse())
    {
        ts -= track.duration;
        track.timestamp = ts;
    }

    console.log(selectedAlbumTracks);

    statusBoxElem = document.getElementById('scrobble-status');
    statusBoxElem.innerHTML = "Sending scrobble data...";
    scrobbleBtnElem = document.getElementById('scrobble-btn');
    scrobbleBtnElem.style.display = 'none';

    // Send query to search backend:
    $.ajax({
      method: "POST",
      data: {"scrobbledata":JSON.stringify(selectedAlbumTracks)},
      url: lastfmScrobbleURL,
    })
      .done(function( msg ) {
        onScrobbleComplete(msg);
      });

}

function onScrobbleComplete(msg)
{
    resultObj = JSON.parse(msg)['scrobbles'];
    console.log(resultObj);
    scrobbleStats = resultObj['@attr'];
    statusBoxElem = document.getElementById('scrobble-status');
    if (scrobbleStats.accepted > 0)
    {
        if (scrobbleStats.ignored > 0)
        {
            statusBoxElem.innerHTML = "<img src=\"icon-error.png\"><br/>" +
                                       "Successfully scrobbled " + scrobbleStats.accepted +
                                      " tracks, but " + scrobbleStats.ignored + 
                                      " were ignored by last.fm - they may contain invalid metadata."
        }
        else
        {
            statusBoxElem.innerHTML = "<img src=\"icon-tick.png\"><br/>" +
                                      "Successfully scrobbled " + scrobbleStats.accepted +
                                      " tracks!"
        }
    }
    else
    {
        statusBoxElem.innerHTML = "<img src=\"icon-error.png\"><br/>" +
                                  "Oops! This scrobble data was rejected by last.fm - this album may contain invalid metadata."
    }
}

function onTimeNowSelected()
{
    document.getElementById("time-selector").style.display = "none";
}

function onTimeCustomSelected()
{
    document.getElementById("time-selector").style.display = "block";
}

function onBackClick()
{
    document.getElementById("album-container").style.display = "none";
    document.getElementById("search-container").style.display = "block";
}


function getCookie(name) {
  var value = "; " + document.cookie;
  var parts = value.split("; " + name + "=");
  if (parts.length == 2) return parts.pop().split(";").shift();
}

$('document').ready(function(){
    var loginName = getCookie('ns_lastfm_user');
    if (loginName)
    {
        document.getElementById("lastfm-connect").innerHTML = "Logged in as " + loginName + ".";
        document.getElementById("search-container").style.display = "block";
    }

    $('#time-selector-input').datetimepicker({
    	    minDate: -7,
	        maxDate: 1
        });
});

