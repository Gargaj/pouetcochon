/*

PouetCochon

no license

*/

function popup(title, msg) {
  var image = null;
  var win = Components.classes['@mozilla.org/embedcomp/window-watcher;1'].
                      getService(Components.interfaces.nsIWindowWatcher).
                      openWindow(null, 'chrome://global/content/alerts/alert.xul',
                                  '_blank', 'chrome,titlebar=no,popup=yes', null);
  win.arguments = [image, title, msg, false, ''];
}

function getDownload(a,dl) {
  var i = a.length;
  while (i--) {
    if (a[i].dl === dl) return a[i];
  }
  return null;
}

function arrayRemove(a, from, to) {
  var rest = a.slice((to || from) + 1 || a.length);
  a.length = from < 0 ? a.length + from : from;
  return a.push.apply(a, rest);
};


XMLDocument.prototype.getNode = function(str) {
  var p = this.getElementsByTagName(str);
  if (p.length)
    return p[0].childNodes[0].nodeValue;
  return "_unknown_";
}

///////////////////////////////////////////////////////////////////////////////////////////////////
// from http://stackoverflow.com/questions/901115/get-query-string-values-in-javascript
function parseQueryString(query) {
  var match,
      pl     = /\+/g,  // Regex for replacing addition symbol with a space
      search = /([^&=]+)=?([^&]*)/g,
      decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); };

  var urlParams = {};
  while (match = search.exec(query))
  {
    urlParams[decode(match[1])] = decode(match[2]);
  }
  return urlParams;
};

function sanitize(str)
{
  return str.replace(/([^a-zA-Z0-9\-\_\.]+)/g,"-")
         //.replace(/^\-+/,"")
         .toLowerCase();
}


window.addEventListener('load', function () {

  var myDownloads = [];

  var downloadManager = Components.classes["@mozilla.org/download-manager;1"]  .getService(Components.interfaces.nsIDownloadManager);
  var ioService       = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
  var dirService      = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
  var prefs           = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
  var environment     = Components.classes["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment);
  var xulRuntime      = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime);
  var prefBranch      = prefs.getBranch("extensions.pouetcochon.");
  var fpHandler       = ioService.getProtocolHandler("file").QueryInterface(Components.interfaces.nsIFileProtocolHandler);

  var defaultPerm = 0755;

  var LOG = Components.utils.reportError;

  if (prefBranch.prefHasUserValue("savePath") == false)
  {
    var desktop = dirService.get("Desk", Components.interfaces.nsIFile);
    desktop.append("demos");
    desktop.append("[YEAR]");
    desktop.append("[PARTY]");
    desktop.append("[COMPO]");
    var path = (desktop.prePath ? desktop.prePath : "") + desktop.path;
    prefBranch.setCharPref("savePath", path );
  }

  downloadManager.addListener({
    onDownloadStateChange : function(state, dl) {
      if (dl.state == Components.interfaces.nsIDownloadManager.DOWNLOAD_CANCELED 
       || dl.state == Components.interfaces.nsIDownloadManager.DOWNLOAD_FAILED)
      {
        var dlObj = getDownload(myDownloads,dl);
        if (dlObj)
        {
          arrayRemove( myDownloads, myDownloads.indexOf( dl ) );
          dlObj.wnd.close();
        }
        return;
      }
      if (dl.state == Components.interfaces.nsIDownloadManager.DOWNLOAD_FINISHED)
      {
        var dlObj = getDownload(myDownloads,dl);
        if (dlObj)
        {
          dlObj.wnd.close();

          arrayRemove( myDownloads, myDownloads.indexOf( dl ) );
          if ( prefBranch.getBoolPref("extractAfterDownload") && dl.target.path.substring( dl.target.path.length - 4 ) == ".zip")
          {
            var zipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(Components.interfaces.nsIZipReader);
            var localFile = fpHandler.getFileFromURLSpec( dl.target.prePath + dl.target.path );
            zipReader.open(localFile);
            var dir = localFile.parent.clone();
            dir.append( localFile.leafName.replace(".zip","") );
            if (!dir.exists()) {
              dir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, defaultPerm);
            }
            var executables = [];

            var files = zipReader.findEntries(null);
            do {
              var fileString = files.getNext();
              var entry = zipReader.getEntry(fileString);
              if (entry.isDirectory)
              {
                var fileComps = fileString.split(/[\\\/]/);
                var loc = dir.clone();
                for(var i = 0; i < fileComps.length; i++)
                {
                  loc.append(fileComps[i]);
                  if (!loc.exists()) {
                    loc.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, defaultPerm);
                  }
                }
              }
            } while (files.hasMore());

            files = zipReader.findEntries(null);
            do {
              var fileString = files.getNext();
              var entry = zipReader.getEntry(fileString);
              if (entry.isDirectory)
                continue;

              var fileComps = fileString.split(/[\\\/]/);

              var loc = dir.clone();
              for(var i = 0; i < fileComps.length; i++)
              {
                loc.append(fileComps[i]);
                if (i < fileComps.length - 1 && !loc.exists()) {
                  loc.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, defaultPerm);
                }
              }

              zipReader.extract(fileString, loc);

              if (xulRuntime.OS == "WINNT")
              {
                if (loc.leafName.substring( loc.leafName.length - 4 ) == ".exe")
                {
                  executables.push(loc);
                }
              }
              else
              {
                if (loc.isExecutable())
                {
                  executables.push(loc);
                }
              }

            } while (files.hasMore());
            if (prefBranch.getBoolPref("runAfterExtract"))
            {
              if (executables.length == 1)
              {
                var process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
                var file    = executables[0];
                var args    = [];
                if (xulRuntime.OS == "WINNT")
                {
                  // we have to do this because nsiProcess doesn't allow changing the working directory, so we use start /D
                  file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
                  file.initWithPath( environment.get("ComSpec") );

                  var cmd = 'start "" /D"' + dir.path + '" "' + executables[0].path + '"';
                  args = ["/C", "start", "fake title", "/D", executables[0].parent.path, executables[0].path ];
                }
                process.init(file);
                process.run(false, args, args.length);
              }
              else if (executables.length > 1)
              {
                if (confirm("More than one executable found - do you want to open the directory?"))
                  executables[0].reveal();
              }
              else
              {
                alert("No executables found.");
              }
            }
            zipReader.close();
          }
        }
      }
    },
    onLocationChange : function(prog, req, loc, dl) { } ,
    onProgressChange : function(prog, req, sProg, sProgMax, tProg, tProgMax, dl) {
      var dlObj = getDownload(myDownloads,dl);
      if (dlObj)
      {
        var f = sProg * 100 / sProgMax;
        dlObj.wnd.document.title = "Downloading demo: " + dlObj.name + " ("+f.toFixed(2) + "%)";

        var progBar = dlObj.wnd.document.getElementById("downloadProgress");
        progBar.value = f;
        var progNum = dlObj.wnd.document.getElementById("downloadProgressNum");
        progNum.value = f.toFixed(2) + "%";
        var progFilename = dlObj.wnd.document.getElementById("downloadFilename");
        progFilename.value = dl.source.prePath + dl.source.path;
        var progLocalFilename = dlObj.wnd.document.getElementById("downloadLocalFilename");
        progLocalFilename.value = dl.target.prePath + dl.target.path;
        var progNumProg = dlObj.wnd.document.getElementById("downloadNumericProgress");
        progNumProg.value = sProg + " / " + sProgMax;
      }
    },
    onSecurityChange : function(prog, req, state, dl) { },
    onStateChange : function(prog, req, flags, status, dl) { },
    onStatusChange : function(prof, req, state, msg, dl) { },
  });

  document.getElementById("pouetcochonPreferencesMenu").addEventListener('click', function(ev) {
    window.openDialog(
      'chrome://pouetcochon/content/preferences.xul',
      'pouetcochonPrefs',
      'chrome,titlebar,toolbar,centerscreen,dialog=no'
    );
  }, false);
  gBrowser.addEventListener('DOMContentLoaded', function(ev) {

    var doc = ev.originalTarget;

    if(doc.location.href.search("pouet.net") == -1 && doc.location.href.search("pouet.scene.org") == -1)
      return;

    if(doc.location.href.search("prod.php") == -1)
      return;

    var span = doc.getElementById("mainDownload");
    var link = doc.getElementById("mainDownloadLink");

    if (link)
    {
      var snort = [
        "*oink*",  // en
        "*röff*",  // hu
        "*groin*", // fr
        "*grunz*", // de
        "*grunz*", // de
        "*röh*",   // fi
        "*&oslash;f*", // dk
      ]
      span.innerHTML = "[<span id='fakeDownloadLink' style='color:red;cursor:pointer;'>"+snort[ Math.floor(Math.random()*snort.length) ]+"</span>] " + span.innerHTML;
      var fake = doc.getElementById("fakeDownloadLink");
      if (fake) fake.addEventListener('click',function(evClick){

        var persist         = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'].createInstance(Components.interfaces.nsIWebBrowserPersist);
        var localFile       = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);

        var originalUrl = link.href;
        var filename = originalUrl.substring( originalUrl.lastIndexOf("/") + 1 );
        if (!filename.length)
        {
          alert("No valid filename found.");
          return true;
        }
        
        if (link.href.indexOf("scene.org/file.php") != -1)
        {
          var url = parseQueryString( link.href.substring( link.href.indexOf("?") + 1 ) );
          originalUrl = url.file;
          if (originalUrl.indexOf("://") == -1)
          {
            originalUrl = "ftp://ftp.scene.org/pub" + originalUrl;
          }
        }
        else if (link.href.indexOf("scene.org/file_dl.php") != -1)
        {
          var url = parseQueryString( link.href.substring( link.href.indexOf("?") + 1 ) );
          originalUrl = url.url;
        }
        var urlParams = parseQueryString( doc.location.search.substring(1) );
        var xnfoUrl = "http://www.pouet.net/export/prod.xnfo.php?which=" + urlParams.which;

        var dlWnd = window.openDialog(
          'chrome://pouetcochon/content/progresswindow.xul',
          'pouetcochonDownload-' + urlParams.which,
          'chrome,titlebar,centerscreen,dialog=no,close=no'
        );

        var xhr = new XMLHttpRequest();
        xhr.open("GET", xnfoUrl, false);
        xhr.onreadystatechange = function(){
          if (xhr.readyState == 4)
          {
            var xml = xhr.responseXML;

            var localPath = prefBranch.getCharPref("savePath");
            localPath = localPath.replace("[FIRSTLETTER]",sanitize(xml.getNode("name").charAt(0)));
            localPath = localPath.replace("[GROUP]",sanitize(xml.getNode("group")));
            localPath = localPath.replace("[PARTY]",sanitize(xml.getNode("party")));
            localPath = localPath.replace("[YEAR]",sanitize(xml.getNode("date").substring( xml.getNode("date").length - 4 )));
            localPath = localPath.replace("[COMPO]",sanitize(xml.getNode("compo")));

            localFile.initWithPath(localPath);
            if (!localFile.exists()) {
              localFile.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, defaultPerm);
            }
            localFile.append(filename);
            var localURI = fpHandler.newFileURI(localFile);

            var download = downloadManager.addDownload(
              Components.interfaces.nsIDownloadManager.DOWNLOAD_TYPE_DOWNLOAD,
              ioService.newURI(originalUrl, null, null),
              localURI,
              "Downloading demo: " + originalUrl,
              null,
              null,
              null,
              persist);
            persist.progressListener = download;
            persist.saveURI(
              ioService.newURI(originalUrl, null, null),
              null,
              null,
              null,
              "",
              localURI);

            myDownloads.push( {id:urlParams.which,dl:download,wnd:dlWnd,name:xml.getNode("name")} );

            popup("PouëtCochon","Demo download started: " + filename);

          }
        }
        xhr.send(null);

        evClick.preventDefault();
        return false;
      },false);
    }
  }, false)

}, false);
