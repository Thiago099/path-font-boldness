
import './style.css'
import opentype from 'opentype.js';
import getNormals from 'polyline-normals';
function distance(p1, p2) {
  const dx = p1.x - p2.x, dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(p1, p2, t) {
  return {x: (1 - t) * p1.x + t * p2.x, y: (1 - t) * p1.y + t * p2.y};
}

function cross(p1, p2) {
  return p1.x * p2.y - p1.y * p2.x;
}

// bezier discretization
const MAX_BEZIER_STEPS = 10;
const BEZIER_STEP_SIZE = 3.0;
// this is for inside checks - doesn't have to be particularly
// small because glyphs have finite resolution
const EPSILON = 1e-6;

// class for converting path commands into point data
class Polygon {
  points = [];
  children = [];
  area = 0.0;

  moveTo(p) {
    this.points.push(p);
  }

  lineTo(p) {
    this.points.push(p);
  }

  close() {
    let cur = this.points[this.points.length - 1];
    this.points.forEach(next => {
      this.area += 0.5 * cross(cur, next);
      cur = next;
    });
  }

  conicTo(p, p1) {
    const p0 = this.points[this.points.length - 1];
    const dist = distance(p0, p1) + distance(p1, p);
    const steps = Math.max(2, Math.min(MAX_BEZIER_STEPS, dist / BEZIER_STEP_SIZE));
    for (let i = 1; i <= steps; ++i) {
      const t = i / steps;
      this.points.push(lerp(lerp(p0, p1, t), lerp(p1, p, t), t));
    }
  }

  cubicTo(p, p1, p2) {
    const p0 = this.points[this.points.length - 1];
    const dist = distance(p0, p1) + distance(p1, p2) + distance(p2, p);
    const steps = Math.max(2, Math.min(MAX_BEZIER_STEPS, dist / BEZIER_STEP_SIZE));
    for (let i = 1; i <= steps; ++i) {
      const t = i / steps;
      const a = lerp(lerp(p0, p1, t), lerp(p1, p2, t), t);
      const b = lerp(lerp(p1, p2, t), lerp(p2, p, t), t);
      this.points.push(lerp(a, b, t));
    }
  }

  inside(p) {
    let count = 0, cur = this.points[this.points.length - 1];
    this.points.forEach(next => {
      const p0 = (cur.y < next.y ? cur : next);
      const p1 = (cur.y < next.y ? next : cur);
      if (p0.y < p.y + EPSILON && p1.y > p.y + EPSILON) {
        if ((p1.x - p0.x) * (p.y - p0.y) > (p.x - p0.x) * (p1.y - p0.y)) {
          count += 1;
        }
      }
      cur = next;
    });
    return (count % 2) !== 0;
  }
}

var boldness = document.getElementById('boldness');
var samplerInput = document.getElementById('sampler');
var textInput = document.getElementById('text');
textInput.addEventListener('input', onupdate);
boldness.addEventListener('change', onupdate);
samplerInput.addEventListener('change', onupdate);
onupdate();
function onupdate() {
  var number = boldness.value;
  var text = textInput.value;
  var sampler = samplerInput.value;

opentype.load("Roboto-Regular.ttf", function(err, font) {
  if (err) {
    alert('Font could not be loaded: ' + err);
  } else {
    // create path
    const path = font.getPath(text, 0, 0, 72);
    // create a list of closed contours
    const polys = [];
    path.commands.forEach(({type, x, y, x1, y1, x2, y2}) => {
      switch (type) {
        case 'M':
          polys.push(new Polygon());
          polys[polys.length - 1].moveTo({x, y});
          break;
        case 'L':
          polys[polys.length - 1].moveTo({x, y});
          break;
        case 'C':
          polys[polys.length - 1].cubicTo({x, y}, {x: x1, y: y1}, {x: x2, y: y2});
          break;
        case 'Q':
          polys[polys.length - 1].conicTo({x, y}, {x: x1, y: y1});
          break;
        case 'Z':
          polys[polys.length - 1].close();
          break;
      }
    });
    
    // sort contours by descending area
    polys.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    // classify contours to find holes and their 'parents'
    const root = [];
    for (let i = 0; i < polys.length; ++i) {
      let parent = null;
      for (let j = i - 1; j >= 0; --j) {
        // a contour is a hole if it is inside its parent and has different winding
        if (polys[j].inside(polys[i].points[0]) && polys[i].area * polys[j].area < 0) {
          parent = polys[j];
          break;
        }
      }
      if (parent) {
        parent.children.push(polys[i]);
      } else {
        root.push(polys[i]);
      }
    }
    
    
    var canvas = document.getElementById("canvas");
    var ctx = canvas.getContext("2d");
    //clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var y = 100;

    function simplifyPath(points, tolerance) {
      let simplifiedPoints = [points[0]];
      let stack = [[0, points.length - 1]];
      
      while (stack.length > 0) {
        let range = stack.pop();
        let maxDistance = 0;
        let index = 0;
        
        for (let i = range[0] + 1; i < range[1]; i++) {
          let distance = distanceToSegment(points[i], points[range[0]], points[range[1]]);
          if (distance > maxDistance) {
            maxDistance = distance;
            index = i;
          }
        }
        
        if (maxDistance > tolerance) {
          stack.push([range[0], index]);
          stack.push([index, range[1]]);
        } else {
          simplifiedPoints.push(points[range[1]]);
        }
      }
      
      return simplifiedPoints;
    }
    
    function distanceToSegment(point, start, end) {
      let dx = end[0] - start[0];
      let dy = end[1] - start[1];
      let t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy);
      t = Math.max(0, Math.min(1, t));
      let x = start[0] + t * dx;
      let y = start[1] + t * dy;
      return Math.hypot(point[0] - x, point[1] - y);
    }


    function draw(points,hull)
    {

      var duplicated = new Set()
      var new_points = []
      for(var i = 0;i<points.length;i++){
        var key = Math.floor(points[i].x/sampler) + "," + Math.floor(points[i].y/sampler)
        if(!duplicated.has(key)){
          new_points.push(points[i])
          duplicated.add(key)
        }
      }
      var input = new_points.map(x=>[x.x,x.y])

      const n = getNormals(input,true)

      points = input.map(x=>{return {x:x[0],y:x[1]}})

      var [[nx,ny],miter] = n[0]
      points[0].x -= nx * number
      points[0].y -= ny * number
      var fist = points[0]
      
      ctx.beginPath()
      ctx.moveTo(fist.x,fist.y+y)
      for(var i = 1;i<points.length;i++){
        const [[nx,ny],miter] = n[i]
        var p = points[i]
        ctx.lineTo(p.x-nx*number,p.y+y-ny*number)
      }
      ctx.lineTo(fist.x,fist.y+y)
      ctx.closePath()
      ctx.fill()
    }
    for(var item of root)
    {
      ctx.globalCompositeOperation = 'source-over';
      draw(item.points,false)
      ctx.globalCompositeOperation = 'destination-out';
      for(var child of item.children)
      {
        draw(child.points,true)
      }
    }
  }
})
}