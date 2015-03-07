/*

PouetCochon

no license

*/

window.addEventListener('load', function () { Task.spawn(function () {

  //var LOG = Components.utils.reportError;
  var LOG = function(str){};
  
  LOG("test");
  function popup(title, msg) {
    var image = null;
    var win = Components.classes['@mozilla.org/embedcomp/window-watcher;1'].
                        getService(Components.interfaces.nsIWindowWatcher).
                        openWindow(null, 'chrome://global/content/alerts/alert.xul',
                                    '_blank', 'chrome,titlebar=no,popup=yes', null);
    win.arguments = [image, title, msg, false, ''];
  }
  
  function getDownload(a,dl) {
    for (var index in a) {
      if (a[index].dl === dl) return index;
    }
    return null;
  }
  
  
  function XMLgetNode(xml,str) {
    var p = xml.getElementsByTagName(str);
    if (p.length && p[0].childNodes.length)
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

  let myDownloads = {};

  LOG("import");
  let {Downloads} = Components.utils.import("resource://gre/modules/Downloads.jsm");
  LOG("Downloads = " + Downloads);
  
  //var downloadManager = Components.classes["@mozilla.org/download-manager;1"]  .getService(Components.interfaces.nsIDownloadManager);
  var ioService       = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
  var dirService      = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
  var prefs           = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
  var environment     = Components.classes["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment);
  var xulRuntime      = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime);
  var prefBranch      = prefs.getBranch("extensions.pouetcochon.");
  var fpHandler       = ioService.getProtocolHandler("file").QueryInterface(Components.interfaces.nsIFileProtocolHandler);

  var privacyContext = window
    .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
    .getInterface(Components.interfaces.nsIWebNavigation)
    .QueryInterface(Components.interfaces.nsILoadContext);

  var defaultPerm = 0755;

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

  let downloadList = yield Downloads.getList(Downloads.ALL);
  LOG("getList = " + downloadList);
  let addv = yield downloadList.addView({
    onDownloadAdded: download => LOG("Added: " + download),
    onDownloadRemoved: download => LOG("Removed: " + download),
    onDownloadChanged: function(dl) {
      var dlID = getDownload(myDownloads,dl);
      if (!dlID)
        return;
        
      if (dl.canceled)
      {
        LOG("cancel = " + dl.target.path);
        myDownloads[dlID].wnd.close();
        delete myDownloads[dlID];
        return;
      }
      else if (dl.succeeded)
      {
        LOG("succeeded = " + dl.target.path);
        myDownloads[dlID].wnd.close();
        delete myDownloads[dlID];

        if ( prefBranch.getBoolPref("extractAfterDownload") && dl.target.path.substring( dl.target.path.length - 4 ).toLowerCase() == ".zip")
        {
          var zipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(Components.interfaces.nsIZipReader);

          var localFile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
          localFile.initWithPath(dl.target.path);

          LOG("localFile = "+localFile);
          zipReader.open(localFile);
          var dir = localFile.parent.clone();
          dir.append( localFile.leafName.replace(/\.zip$/i,"") );
          LOG("dir = "+dir.target);
          if (!dir.exists()) {
            dir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, defaultPerm);
          }
          var executables = [];

          var files = zipReader.findEntries(null);
          do {
            var fileString = files.getNext();
            LOG("fileString = "+fileString);
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
            LOG("[extr] fileString = "+fileString);
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

            LOG("[extr] loc = " + loc.target);
            zipReader.extract(fileString, loc);

            if (xulRuntime.OS == "WINNT")
            {
              if (loc.leafName.substring( loc.leafName.length - 4 ).toLowerCase() == ".exe")
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
                file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
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
      else if (dl.error)
      {
        dl.finalize();
        alert( dl.error );
        myDownloads[dlID].wnd.close();
        delete myDownloads[dlID];
      }
      else
      {
        var f = dl.totalBytes ? (dl.currentBytes * 100.0 / dl.totalBytes) : 0.0;
        myDownloads[dlID].wnd.document.title = "Downloading demo: " + myDownloads[dlID].name + " ("+f.toFixed(2) + "%)";

        var progBar = myDownloads[dlID].wnd.document.getElementById("downloadProgress");
        progBar.value = f;
        var progNum = myDownloads[dlID].wnd.document.getElementById("downloadProgressNum");
        progNum.value = f.toFixed(2) + "%";
        var progFilename = myDownloads[dlID].wnd.document.getElementById("downloadFilename");
        progFilename.value = dl.source.url;
        var progLocalFilename = myDownloads[dlID].wnd.document.getElementById("downloadLocalFilename");
        progLocalFilename.value = dl.target.path;
        var progNumProg = myDownloads[dlID].wnd.document.getElementById("downloadNumericProgress");
        progNumProg.value = dl.currentBytes + " / " + dl.totalBytes;
      }
    },
  });
  LOG("addView = " + addv);

  var e = document.getElementById("pouetcochonPreferencesMenu");
  LOG("menu = " + e);
  e.addEventListener('click', function(ev) {
    LOG("evLis = " + ev);
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
        "*röh*",   // fi
        "*&oslash;f*", // dk
      ]
      span.innerHTML = "[<span id='fakeDownloadLink' style='color:red;cursor:pointer;'>"+snort[ Math.floor(Math.random()*snort.length) ]+"</span>] " + span.innerHTML;
      var fake = doc.getElementById("fakeDownloadLink");
      if (fake) fake.addEventListener('click',function(evClick){

        var originalUrl = link.href;
        
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
        else if (link.href.indexOf("files.scene.org/view") != -1)
        {
          var url = link.href.replace("files.scene.org/view","files.scene.org/get");
          //originalUrl = url;
        }
        LOG("originalUrl = " + originalUrl);
        
        var filename = originalUrl.substring( originalUrl.lastIndexOf("/") + 1 );
        if (!filename.length)
        {
          alert("No valid filename found.");
          return true;
        }
        filename = filename.replace(/[\?\*\\]/gi,"_");
        LOG("filename = " + originalUrl);
        
        var urlParams = parseQueryString( doc.location.search.substring(1) );
        
        if (myDownloads[urlParams.which])
        {
          myDownloads[urlParams.which].wnd.focus();
          return;
        }
        
        var xnfoUrl = "http://www.pouet.net/export/prod.xnfo.php?which=" + urlParams.which;

        var dlWnd = window.openDialog(
          'chrome://pouetcochon/content/progresswindow.xul',
          'pouetcochonDownload-' + urlParams.which,
          'chrome,titlebar,centerscreen,dialog=no,close=no'
        );

        var xhr = new XMLHttpRequest();
        xhr.open("GET", xnfoUrl, true);
        xhr.addEventListener("load", function(e) {
          var xml = xhr.responseXML;

          var localPath = prefBranch.getCharPref("savePath");
          localPath = localPath.replace("[FIRSTLETTER]",sanitize(XMLgetNode(xml,"name").charAt(0)));
          LOG("localPath[1] = " + localPath);
          localPath = localPath.replace("[GROUP]",sanitize(XMLgetNode(xml,"group")));
          LOG("localPath[2] = " + localPath);
          localPath = localPath.replace("[PARTY]",sanitize(XMLgetNode(xml,"party")));
          LOG("localPath[3] = " + localPath);
          localPath = localPath.replace("[YEAR]",sanitize(XMLgetNode(xml,"date").substring( 0, 4 )));
          LOG("localPath[4] = " + localPath);
          localPath = localPath.replace("[COMPO]",sanitize(XMLgetNode(xml,"compo")));
          LOG("localPath[5] = " + localPath);

          //var persist   = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'].createInstance(Components.interfaces.nsIWebBrowserPersist);
          var localFile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);

          localFile.initWithPath(localPath);
          if (!localFile.exists()) {
            localFile.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, defaultPerm);
          }
          localFile.append(filename);
          var localURI = fpHandler.newFileURI(localFile);

          LOG("originalUrl = " + originalUrl);
          LOG("localURI = " + localFile);

          Task.spawn(function () {
            var download = yield Downloads.createDownload({
              source: originalUrl,
              target: localFile,
            });
            /*
            download.onchange = function() { 
              LOG("whee: " + download.currentBytes + " / " + download.totalBytes); 
            }
            */
            downloadList.add(download);
            var name = XMLgetNode(xml,"name");
            myDownloads[urlParams.which] = { id:urlParams.which, dl:download, wnd:dlWnd, name:name };
            LOG("test = " + myDownloads[urlParams.which]);
            LOG("test2 = " + Object.keys(myDownloads).length);
            try 
            {
              download.start();
              LOG("download.start()");
            } 
            finally 
            {
              popup("PouëtCochon","Demo download started: " + filename);
            }
            /*
            dlWnd.onbeforeunload = function()
            {
              if (confirm("Do you want to cancel the download for " + name + "?"))
              {
                download.cancel();
                LOG("cancelled = " + download.target.path);
              }
              //delete myDownloads[urlParams.which];
            }
            */
            LOG("download = " + download);
          }).then(null, Components.utils.reportError);

        },false);
        
        xhr.send();

        evClick.preventDefault();
        return false;
      },false);
    }
  }, false)
}).then(null, Components.utils.reportError); }, false);
