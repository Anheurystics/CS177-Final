class Preloader {
    constructor(callback) {
        this.callback = callback;
        this.imageAssets = [];
        this.textAssets = [];
        this.preloaded = 0;
        this.total = 0;

        this.imageList = [];
        this.textList = [];
    }

    addImage(filename, id) {
        this.imageList.push({filename: filename, id: id ==  undefined? filename : id});
    }

    addText(filename, id) {
        this.textList.push({filename: filename, id: id ==  undefined? filename : id});
    }
    
    getImage(id) {
        return this.imageAssets[id];
    }

    getText(id) {
        return this.textAssets[id];
    }

    preload() {
        for(var i = 0; i < this.imageList.length; i++) {
            this.total++;
            
            var info = this.imageList[i];
            
            var scope = this;
            this.imageAssets[info.id] = new Image();
            this.imageAssets[info.id].src = info.filename;
            this.imageAssets[info.id].onload = function() {
                scope.preloaded++;
                if(scope.preloaded == scope.total) {
                    scope.callback();
                }
            }   
        }

        for(var i = 0; i < this.textList.length; i++) {
            this.total++;
            
            var info = this.textList[i];

            var scope = this;
            var req = new XMLHttpRequest();
            req.id = info.id;
            req.onreadystatechange = function () {
                if (this.readyState == 4 && this.status == 200) {
                    scope.textAssets[this.id] = this.responseText;
                    scope.preloaded++;
                    if(scope.preloaded == scope.total) {
                        scope.callback();
                    }
                }
                if(this.readyState == 4 && this.status == 404) {
                    scope.preloaded++;
                    if(scope.preloaded == scope.total) {
                        scope.callback();
                    }
                }
            };
            req.open("GET", info.filename, true);
            req.send();
        }    
    }
}