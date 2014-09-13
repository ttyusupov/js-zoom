var url = 'http://farm8.staticflickr.com/7097/7357430266_54bf1e7069_b.jpg'
  , zoom
  , Zoomer = Backbone.View.extend(
    { events:
      { 'click button.zoom-in':   'zoomIn'
      , 'click button.zoom-out':  'zoomOut'
      , 'mousewheel .spill-zone': 'zoom'
      , 'mousedown .spill-zone':  'dragStart'
      }

    // used solely for decoding what image_scale===1 means, for some given image
    , page_w: 960
    , page_h: 640

    , $bg: null // this widget's zoomable image

    , initialize: function(img_opts) {
        _.bindAll( this, 'load', 'place' // fetching the image
                 , 'input', 'output' // data conversion, to/from site format
                 , 'zoom', 'zoomIn', 'zoomOut', 'zoomBy', 'legalCoords'
                 , 'dragStart', 'dragMove', 'dragEnd'
                 );

        this.$bg    = this.$('.zoomer img');
        this.$z_in  = this.$('button.zoom-in');
        this.$z_out = this.$('button.zoom-out');

        // undefined, if first time we load a picture, otherwise set in 'input':
        this.height = // original image height
        this.width  = // original image width
        this.dx     = // hor. offset of image tag
        this.dy     = // vert offset of image tag
        this.zoom_w = undefined; // width, zoomed
        if ('image_scale' in img_opts) this.input(img_opts);

        // this.load (really this.place) sets these, once we have all details
        this.min_w  =
        this.max_w  = undefined;
        this.load(img_opts.url);
      }

    , input: function(data) {
        // this code corresponds loosely to app/helpers/pages_helper.rb's ie8
        // fallback, where we're back-computing what a scale-from-center of s
        // does to the top / left coordinates
        var img_w   = this.width  = data.width
          , img_h   = this.height = data.height
          , delta   = (data.image_scale - 1) / 2 // coord. translation factor

          // a page is page_w * page_h, which becomes boxed.width * boxed.height
          // at the minimum zoom level needed to attain our full-frame fill-crop
          , boxed   = constrain(img_w, img_h, this.page_w, this.page_h)
          ;
        this.dx     = Math.round(data.offset_x - delta * boxed.width);
        this.dy     = Math.round(data.offset_y - delta * boxed.height);
        this.zoom_w = Math.round(data.image_scale * boxed.width);
      }
    , output: function() {
        var boxed = constrain(this.width, this.height, this.page_w, this.page_h)
          , base  = boxed.width / this.width // baseline image width at pg scale
          , scale = this.zoom_w / this.width / base
          , delta = (this.zoom_w / boxed.width - 1) / 2
          ;
        return { offset_x: Math.round(this.dx + boxed.width  * (scale-1) / 2)
               , offset_y: Math.round(this.dy + boxed.height * (scale-1) / 2)
               , image_scale: scale
               };
      }

    , load: function(url) {
        var img = this.$bg.get(0);
        img.src = url;
        if (img.naturalWidth)
          this.place();
        else
          this.$bg.load(this.place);
      }
    , place: function(dx, dy) {
        if (!_.isNumber(dx) || !_.isNumber(dy)) dx = dy = 0;
        var self   = this
          , $bg    = this.$bg
          , $box   = $bg.parent()
          , box_w  = $box.width(),  mid_x = box_w >> 1
          , box_h  = $box.height(), mid_y = box_h >> 1
          , img    = $bg.get(0)
          , img_h  = Math.round(this.zoom_w * this.height / this.width)
          , boxed, w, h
          ;

        if (!_.isNumber(this.zoom_w)) { // fill-crop to mid part of image
          this.width  = w = img.naturalWidth;
          this.height = h = img.naturalHeight;
          boxed       = constrain(this.width, this.height, box_w, box_h);
          this.zoom_w = boxed.width;
          this.dx     = parseInt(boxed['margin-left'] || '0', 10);
          this.dy     = parseInt(boxed['margin-top']  || '0', 10);
        }
        $bg.css(this.legalCoords({ width: this.zoom_w
                                 , left:  this.dx + dx
                                 , top:   this.dy + dy
                                 }));

        $.each(this.output(), function debug(k, val) {
          self.$('.debug .' + k).text(val.toFixed(k === 'image_scale' ? 2 : 0));
        });

        // bounds of the zoom widget; zooming outside of this range not possible
        if (!this.min_w) {
          boxed = boxed || constrain(this.width, this.height, box_w, box_h);
          this.min_w = boxed.width;
          this.max_w = Infinity; // FIXME: would be nicer MAX_ZOOM_FACTOR based
          // console.log( 'min:', this.min_w
          //            , 'max:', this.max_w);
        }

        // show visually when you can't zoom any deeper / further out
        this.$z_in.prop( 'disabled', this.zoom_w >= this.max_w);
        this.$z_out.prop('disabled', this.zoom_w <= this.min_w);
      }

    , legalCoords: function(data) {
        var $box  = this.$bg.parent()
          , img_h = Math.round(this.zoom_w * this.height / this.width)
          ;
        data.left = confine(data.left, [$box.width() - this.zoom_w, 0]);
        data.top  = confine(data.top,  [$box.height() - img_h,      0]);
        return data;
      }

    , dragStart: function(e) {
        var drag = '.zoom-drag-'+ this.cid; // scope our event listeners
        $(window).bind('mouseup' + drag,    this.dragEnd)
                 .bind('mouseleave' + drag, this.dragEnd)
                 .bind('mousemove' + drag,  this.dragMove);
        this.x = e.clientX;
        this.y = e.clientY;
        e.preventDefault();
      }
    , dragEnd: function(e) {
        $(window).unbind('.zoom-drag-'+ this.cid);
        e.preventDefault();
        var pos = this.legalCoords({ left: this.dx + e.clientX - this.x
                                   , top:  this.dy + e.clientY - this.y });
        this.dx = pos.left;
        this.dy = pos.top;
        this.place();
      }
    , dragMove: function(e) {
        this.place(e.clientX - this.x, e.clientY - this.y);
      }

    , zoom: function(e) {
        var orig = e.originalEvent
          , dy   = orig.wheelDeltaY ? orig.wheelDeltaY / 120 :
                   orig.wheelDelta  ? orig.wheelDelta  / 120 :
                   orig.detail      ? orig.detail      / 3   : 0
          , zoom = dy<0 ? 'zoomOut' : 'zoomIn'
          ;
        if (zoom) {
          e.preventDefault();
          this[zoom](e);
        }
      }
    , zoomIn: function(e) {
        if (this.zoomBy(e, +1)) this.place();
      }
    , zoomOut: function(e) {
        if (this.zoomBy(e, -1)) this.place();
      }
    // picks amount of zoom and tries to zoom, relative to the viewport's center
    // (returns the amount of change to the image width -- so 0 means no change)
    , zoomBy: function(e, sign) {
        // for more precision - hold shift, for fast zooming - hold alt
        var shift = e.shiftKey ? 1   : 10
          , alt   = e.metaKey  ? 100 : 1
          , amt   = sign * alt * shift

          // do the actual zoom (within bounds)
          , old_w = this.zoom_w
          , old_h = this.zoom_w * this.height / this.width
          , new_w = this.zoom_w = confine(old_w + amt, [this.min_w, this.max_w])
          , new_h = this.zoom_w * this.height / this.width
          , delta = new_w - old_w

          // what coordinate should the current centerpoint be in the new image?
          , $box  = this.$bg.parent()
          , box_w = $box.width()
          , box_h = $box.height()
          , x_dom = [-new_w + box_w / 2, box_w / 2]
          , y_dom = [-new_h + box_h / 2, box_h / 2]
          // FIXME: the centering math here needs rethinking somehow
          , pct_x = pct(confine(this.dx - box_w / 2, x_dom), x_dom)
          , pct_y = pct(confine(this.dy - box_h / 2, y_dom), y_dom)
          ;

        function pct(n, domain) {
          var total = domain[1] - domain[0];
          return (n - domain[0]) / total;
        }

        //console.log(this.dx, this.dy, pct_x.toFixed(4), pct_y.toFixed(4));

        this.dx += delta * pct_x;
        this.dy += delta * pct_y;
        return delta;
      }
  })
  ;

$(document).ready(function() {
  zoom = new Zoomer({ el:          $('#page-1').get(0)
                    , url:         url
                  //, image_scale: 1.8
                  //, offset_x:    -255
                  //, offset_y:    -354
                  //, width:       785
                  //, height:      594
                    });
});

function constrain(img_w, img_h, to_w, to_h) {
  var box_w = (to_w || 800)
    , box_h = (to_h || 600)

    // aspect ratios
    , box_a = box_w / box_h
    , img_a = img_w / img_h

    // only one of these is used, depending on the image and box aspect ratios:
    , new_w = Math.floor(box_h * img_a)
    , new_h = Math.floor(box_w / img_a)
    ;
  return img_a < box_a ?
    { width: box_w, height: new_h, 'margin-top':  (box_h - new_h) >> 1 }
  : { width: new_w, height: box_h, 'margin-left': (box_w - new_w) >> 1 };
}

function confine(n, domain) {
  return Math.max(domain[0], Math.min(n, domain[1]));
}
