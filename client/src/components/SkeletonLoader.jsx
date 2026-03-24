import PropTypes from 'prop-types';

export const Skeleton = ({ className, width, height, borderRadius = '0.5rem' }) => {
  return (
    <div 
      className={`animate-pulse bg-slate-200 dark:bg-slate-700 ${className}`} 
      style={{ 
        width: width || '100%', 
        height: height || '1rem',
        borderRadius: borderRadius
      }}
    />
  );
};

export const TableSkeleton = ({ rows = 5, cols = 4 }) => {
  return (
    <div className="w-full space-y-4">
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height="2rem" className="flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height="1.5rem" className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
};

export const CardSkeleton = () => {
  return (
    <div className="p-4 border border-slate-100 rounded-2xl bg-white space-y-3">
      <Skeleton height="8rem" className="rounded-xl" />
      <Skeleton width="60%" height="1.25rem" />
      <Skeleton width="40%" height="1rem" />
    </div>
  );
};

Skeleton.propTypes = {
  className: PropTypes.string,
  width: PropTypes.string,
  height: PropTypes.string,
  borderRadius: PropTypes.string,
};

TableSkeleton.propTypes = {
  rows: PropTypes.number,
  cols: PropTypes.number,
};

export default Skeleton;
